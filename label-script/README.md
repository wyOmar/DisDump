# DisDump Local Media Indexer (`qwen-rtx.py`)

Offline visual tag and OCR indexer for Discord attachment archives using Qwen2.5-VL-3B-Instruct.

The script scans images inside the `disdump-download` directory, generates OCR text and visual labels, and stores the results in `screenshots.db` for use with the DisDump web interface.

---

## Requirements

- Python 3.10 or 3.11
- NVIDIA GPU with CUDA support
- ~6.5 GB free disk space for initial model download

---

## Setup

1. Place `qwen-rtx.py`, `requirements.txt`, and `README.md` inside your `disdump-download` folder:

```text
disdump-download/
├── png/
├── jpg/
├── webp/
├── qwen-rtx.py
├── requirements.txt
└── README.md
```

2. Create and activate a virtual environment:

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\activate
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

3. Install PyTorch with CUDA support:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

4. Install the remaining dependencies:

```bash
pip install -r requirements.txt
```

---

## Usage

1. Run the indexing script:

```bash
python qwen-rtx.py
```

2. Open the DisDump web interface in a Chromium-based browser (Chrome, Edge, Brave).
3. Go to **My Attachments** or **Label Search**, click **Open Folder**, and select your `disdump-download` directory. The UI will automatically detect `screenshots.db`.

---

## Configuration

You can adjust `BATCH_SIZE` inside `qwen-rtx.py` (line 27) based on available VRAM:

- **6 GB VRAM:** `1` or `2`
- **8 GB - 12 GB VRAM:** `4` (Default)
- **16 GB+ VRAM:** `6` or `8`