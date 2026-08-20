#!/usr/bin/env python3
"""
Discord Archive Media Indexer (Qwen2.5-VL 3B - High-Throughput RTX Edition)
Optimized for NVIDIA RTX 20xx, 30xx, 40xx, 50xx GPUs.

Features:
- Dynamic Mini-Batching (Batch Size: 4)
- Native BF16 / FP16 Inference with SDPA Attention
- ImageOps EXIF Orientation Normalization
- Tokenizer Left-Padding
- Strict Prompt-Bleed Sanitizer
- SQLite WAL Mode & In-Memory PRAGMA Optimization
"""

import os
import sys
import json
import re
import sqlite3
from pathlib import Path
from PIL import Image, ImageOps
import torch
from tqdm import tqdm
from transformers import (
    Qwen2_5_VLForConditionalGeneration,
    AutoProcessor,
)
from qwen_vl_utils import process_vision_info

# Enable Tensor Core acceleration
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True

DB_FILE = "screenshots.db"
BATCH_SIZE = 4  # Set to 6 or 8 on 16GB+ GPUs (RTX 4080 / 4090)

# --- 1. Database Setup ---
def init_database(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.execute("PRAGMA cache_size = -64000;")
    cursor.execute("PRAGMA temp_store = MEMORY;")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS screenshot_search (
            image_filename TEXT PRIMARY KEY,
            ocr_text TEXT,
            visual_tags TEXT
        );
    """)

    cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS screenshot_fts USING fts5(
            image_filename UNINDEXED,
            ocr_text,
            visual_tags,
            content='screenshot_search',
            content_rowid='rowid',
            tokenize = 'porter unicode61'
        );
    """)

    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS screenshot_search_ai AFTER INSERT ON screenshot_search BEGIN
            INSERT INTO screenshot_fts(rowid, image_filename, ocr_text, visual_tags)
            VALUES (new.rowid, new.image_filename, new.ocr_text, new.visual_tags);
        END;
    """)
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS screenshot_search_ad AFTER DELETE ON screenshot_search BEGIN
            INSERT INTO screenshot_fts(screenshot_fts, rowid, image_filename, ocr_text, visual_tags)
            VALUES('delete', old.rowid, old.image_filename, old.ocr_text, old.visual_tags);
        END;
    """)
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS screenshot_search_au AFTER UPDATE ON screenshot_search BEGIN
            INSERT INTO screenshot_fts(screenshot_fts, rowid, image_filename, ocr_text, visual_tags)
            VALUES('delete', old.rowid, old.image_filename, old.ocr_text, old.visual_tags);
            INSERT INTO screenshot_fts(rowid, image_filename, ocr_text, visual_tags)
            VALUES (new.rowid, new.image_filename, new.ocr_text, new.visual_tags);
        END;
    """)

    conn.commit()
    return conn

def get_already_indexed(conn: sqlite3.Connection) -> set:
    cursor = conn.cursor()
    cursor.execute("SELECT image_filename FROM screenshot_search")
    return {row[0] for row in cursor.fetchall()}

# --- 2. Taxonomy Expansion & Sanitization ---
JUNK_TAGS = {
    "none", "unknown", "n/a", "null", "undefined", "other", 
    "etc", "image", "photo", "screenshot", "real life photo"
}

PROMPT_BLEED_PATTERNS = [
    r"or category",
    r"\(e\.g\..*?\)",
    r"e\.g\.",
    r"specific video game.*",
    r"video game title",
    r"minecraft, valorant",
    r"discord chat, code",
    r"comma-separated.*",
    r"high-level categories.*",
    r"all readable text.*"
]

GROUPINGS = {
    "food": ["noodle", "noodles", "egg", "eggs", "sausage", "sausages", "bread", "toast", "beans", "meat", "ribs", "grill", "bbq", "breakfast", "ramen", "soup", "snack", "cookie", "pizza", "burger", "coffee", "tea", "dish", "plate", "meal"],
    "animal": ["cat", "dog", "puppy", "kitten", "mammoth", "pet", "cow", "cows", "bird", "fish", "plush", "garfield"],
    "hardware": ["cpu", "gpu", "temp", "temperature", "fan", "fps", "usage", "ram", "benchmark", "afterburner", "hwmonitor", "rtx", "gtx", "ryzen", "intel"],
    "gaming": ["minecraft", "valorant", "elden ring", "clash of clans", "hud", "minimap", "scoreboard", "crosshair", "inventory", "gameplay", "fps"]
}

def enrich_tags_with_groupings(tag_string: str) -> str:
    tags_lower = tag_string.lower()
    inferred_groups = []
    for parent_group, keywords in GROUPINGS.items():
        if any(kw in tags_lower for kw in keywords):
            if parent_group not in tags_lower:
                inferred_groups.append(parent_group)
    if inferred_groups:
        return f"{', '.join(inferred_groups)}, {tag_string}"
    return tag_string

# --- 3. Model Loading ---
def load_qwen_model():
    model_id = "Qwen/Qwen2.5-VL-3B-Instruct"
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    print(f"🚀 Loading {model_id} in native {dtype} on {torch.cuda.get_device_name(0)}...")

    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        model_id,
        torch_dtype=dtype,
        attn_implementation="sdpa",
        device_map="auto"
    )

    processor = AutoProcessor.from_pretrained(
        model_id,
        min_pixels=256 * 28 * 28,
        max_pixels=600 * 28 * 28
    )
    processor.tokenizer.padding_side = "left"

    return model, processor

# --- 4. Output Parser ---
def extract_field_fallback(raw_text: str, field_name: str) -> str:
    pattern = rf'"{field_name}"\s*:\s*"((?:\\.|[^"\\])*)"'
    match = re.search(pattern, raw_text, re.DOTALL)
    if match:
        val = match.group(1)
        try:
            return val.encode().decode("unicode_escape", errors="ignore").strip()
        except Exception:
            return val.strip()
    return ""

def clean_vlm_output(raw_text: str) -> tuple[str, str]:
    ocr_text = ""
    game_title = ""
    tags = ""

    clean_str = re.sub(r"^```(?:json)?|```$", "", raw_text.strip(), flags=re.MULTILINE).strip()

    try:
        data = json.loads(clean_str, strict=False)
        game_title = str(data.get("game_or_type", "")).strip()
        tags = str(data.get("visual_tags", "")).strip()
        ocr_text = str(data.get("ocr_text", "")).strip()
    except Exception:
        game_title = extract_field_fallback(raw_text, "game_or_type")
        tags = extract_field_fallback(raw_text, "visual_tags")
        ocr_text = extract_field_fallback(raw_text, "ocr_text")

    raw_tag_list = []
    if game_title:
        raw_tag_list.extend(game_title.split(","))
    if tags:
        raw_tag_list.extend(tags.split(","))

    cleaned_tokens = []
    seen = set()

    for t in raw_tag_list:
        clean_t = re.sub(r'[{}\[\]"\'`()]', "", t).strip(" ,.-_")
        clean_t_lower = clean_t.lower()

        has_bleed = any(re.search(pattern, clean_t_lower) for pattern in PROMPT_BLEED_PATTERNS)

        if (
            clean_t 
            and not has_bleed
            and clean_t_lower not in JUNK_TAGS 
            and clean_t_lower not in seen
            and len(clean_t) < 40
        ):
            seen.add(clean_t_lower)
            cleaned_tokens.append(clean_t)

    combined_tags = ", ".join(cleaned_tokens)
    combined_tags = enrich_tags_with_groupings(combined_tags)

    return ocr_text, combined_tags

# --- 5. Main Processing Loop ---
def main():
    root_dir = Path.cwd()
    print(f"📂 Scanning working directory: {root_dir}")

    supported_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
    image_files = [
        f for f in root_dir.rglob("*") 
        if f.is_file() and f.suffix.lower() in supported_exts and not f.name.startswith(".")
    ]

    if not image_files:
        print("❌ No supported images found.")
        sys.exit(0)

    print(f"🖼️ Found {len(image_files)} image files.")

    conn = init_database(DB_FILE)
    indexed_filenames = get_already_indexed(conn)
    pending_files = [f for f in image_files if f.name not in indexed_filenames]

    print(f"⚡ Already Indexed: {len(indexed_filenames)} | Remaining: {len(pending_files)}")

    if not pending_files:
        print("🎉 All images are already indexed in screenshots.db!")
        conn.close()
        return

    model, processor = load_qwen_model()
    cursor = conn.cursor()

    system_prompt = (
        "Analyze the image and return ONLY a valid JSON object matching this schema:\n"
        "{\n"
        '  "game_or_type": "",\n'
        '  "visual_tags": "",\n'
        '  "ocr_text": ""\n'
        "}\n\n"
        "Field Instructions:\n"
        "1. game_or_type: Name the specific video game if one is shown (e.g. Minecraft, Valorant). Otherwise state the media type (e.g. Discord Chat, Code, Meme, Photo).\n"
        "2. visual_tags: Comma-separated descriptive keywords. Include general categories (food, animal, hardware, gaming, vehicle) followed by specific items.\n"
        "3. ocr_text: All visible readable text, numbers, and UI chat logs verbatim.\n\n"
        "Strict Rules:\n"
        "- Never write 'None', 'Unknown', or 'N/A'.\n"
        "- Never echo or repeat the prompt instructions inside the fields.\n"
        "- Return ONLY the JSON object with no markdown explanation."
    )

    print(f"\n🔍 Running Batched Inference (Batch Size: {BATCH_SIZE})...")
    progress = tqdm(total=len(pending_files), desc="Indexing", unit="img")

    for i in range(0, len(pending_files), BATCH_SIZE):
        batch_paths = pending_files[i:i + BATCH_SIZE]
        batch_messages = []
        valid_paths = []

        for p in batch_paths:
            try:
                with Image.open(p) as raw_img:
                    pil_img = ImageOps.exif_transpose(raw_img).convert("RGB")

                batch_messages.append([
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "image": pil_img},
                            {"type": "text", "text": system_prompt},
                        ],
                    }
                ])
                valid_paths.append(p)
            except Exception:
                cursor.execute(
                    "INSERT OR REPLACE INTO screenshot_search (image_filename, ocr_text, visual_tags) VALUES (?, ?, ?)",
                    (p.name, "", "")
                )
                progress.update(1)

        if not batch_messages:
            continue

        try:
            prompts = [
                processor.apply_chat_template(msg, tokenize=False, add_generation_prompt=True)
                for msg in batch_messages
            ]
            image_inputs, video_inputs = process_vision_info(batch_messages)

            inputs = processor(
                text=prompts,
                images=image_inputs,
                videos=video_inputs,
                padding=True,
                return_tensors="pt",
            ).to(model.device)

            with torch.inference_mode():
                generated_ids = model.generate(
                    **inputs,
                    max_new_tokens=180,
                    do_sample=False,
                )
                generated_ids_trimmed = [
                    out_ids[len(in_ids):]
                    for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
                ]
                output_texts = processor.batch_decode(
                    generated_ids_trimmed,
                    skip_special_tokens=True,
                    clean_up_tokenization_spaces=False,
                )

            db_records = []
            for path, out_text in zip(valid_paths, output_texts):
                ocr_text, visual_tags = clean_vlm_output(out_text)
                db_records.append((path.name, ocr_text, visual_tags))

            cursor.executemany(
                "INSERT OR REPLACE INTO screenshot_search (image_filename, ocr_text, visual_tags) VALUES (?, ?, ?)",
                db_records,
            )
            conn.commit()

        except Exception as e:
            for path in valid_paths:
                cursor.execute(
                    "INSERT OR REPLACE INTO screenshot_search (image_filename, ocr_text, visual_tags) VALUES (?, ?, ?)",
                    (path.name, "", "")
                )
            conn.commit()

        progress.update(len(batch_paths))

    conn.close()
    print(f"\n✅ High-Speed Indexing complete! Database '{DB_FILE}' updated.")

if __name__ == "__main__":
    main()