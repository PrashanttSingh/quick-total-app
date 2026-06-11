import os
import glob
import json
import re
import zipfile

SROIE_TRAIN_DIR = "Raw_Datasets/SROIE_Receipts/SROIE2019/train"
SROIE_TEST_DIR = "Raw_Datasets/SROIE_Receipts/SROIE2019/test"
OUTPUT_JSONL = "stage1_sroie.jsonl"
OUTPUT_ZIP = "stage1_sroie.zip"

PROMPT = (
    "You are an expert OCR AI for receipts."
    " Read this printed receipt image."
    " Extract ALL line items and key fields."
    " Output ONLY raw JSON in this exact format:"
    ' {"store": "store name", "date": "DD/MM/YYYY",'
    ' "items": [{"item": "product name", "amount": 0.00}], "total": 0.00}'
    " No markdown. No explanation. Raw JSON only."
)


def find_images(folder):
    results = []
    for ext in ["*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"]:
        results.extend(glob.glob(os.path.join(folder, "**", ext), recursive=True))
        results.extend(glob.glob(os.path.join(folder, ext)))
    return list(set(results))


def parse_sroie_txt(txt_path):
    lines = []
    with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(",", 8)
            if len(parts) >= 9:
                text = parts[8].strip()
                if text:
                    lines.append(text)
    return lines


def lines_to_json(text_lines):
    items = []
    total = 0.0
    store = text_lines[0] if text_lines else "Unknown Store"
    date = ""
    for line in text_lines:
        date_match = re.search(r"\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}", line)
        if date_match and len(line) < 20:
            date = line
            continue
        price_match = re.search(r"(\d+\.\d{2})", line)
        if price_match:
            amount = float(price_match.group(1))
            item_name = re.sub(r"(\d+\.\d{2})", "", line)
            item_name = re.sub(r"\bRM\b", "", item_name, flags=re.IGNORECASE).strip()
            if item_name and len(item_name) > 1:
                total = amount
                items.append({"item": item_name, "amount": amount})
    if len(items) > 1:
        items = items[:-1]
    return {"store": store, "date": date, "items": items, "total": total}


def main():
    print("BUILDING SROIE DATASET")
    print("=" * 50)

    records = []
    skipped = 0

    for folder_path in [SROIE_TRAIN_DIR, SROIE_TEST_DIR]:
        label = "train" if "train" in folder_path else "test"

        if not os.path.exists(folder_path):
            print("Folder not found: " + folder_path)
            continue

        images = find_images(folder_path)
        print("SROIE/" + label + ": " + str(len(images)) + " images found")

        for img_path in sorted(images):
            base = os.path.splitext(os.path.basename(img_path))[0]

            txt_path = os.path.join(folder_path, "box", base + ".txt")

            if not os.path.exists(txt_path):
                skipped += 1
                continue

            text_lines = parse_sroie_txt(txt_path)
            if not text_lines:
                skipped += 1
                continue

            ground_truth = lines_to_json(text_lines)

            record = {
                "id": "sroie_" + label + "_" + base,
                "conversations": [
                    {
                        "role": "user",
                        "value": "<img>" + os.path.basename(img_path) + "</img>\n" + PROMPT
                    },
                    {
                        "role": "assistant",
                        "value": json.dumps(ground_truth, ensure_ascii=False, indent=2)
                    }
                ],
                "_abs": img_path
            }
            records.append(record)
            print("OK: " + base)

    if not records:
        print("NO RECORDS BUILT. Check folder paths:")
        print("  Train: " + SROIE_TRAIN_DIR)
        print("  Test:  " + SROIE_TEST_DIR)
        return

    with open(OUTPUT_JSONL, "w", encoding="utf-8") as f:
        for r in records:
            clean = {}
            for k, v in r.items():
                if not k.startswith("_"):
                    clean[k] = v
            f.write(json.dumps(clean, ensure_ascii=False) + "\n")

    seen = set()
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(OUTPUT_JSONL, OUTPUT_JSONL)
        for r in records:
            ip = r.get("_abs", "")
            if ip and os.path.exists(ip):
                fname = os.path.basename(ip)
                if fname not in seen:
                    zf.write(ip, "images/" + fname)
                    seen.add(fname)

    print("=" * 50)
    print("DONE!")
    print("Records : " + str(len(records)))
    print("Skipped : " + str(skipped))
    print("JSONL   : " + OUTPUT_JSONL)
    print("ZIP     : " + OUTPUT_ZIP)
    print("=" * 50)


if __name__ == "__main__":
    main()