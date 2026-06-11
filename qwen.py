import os
import glob
import json
import zipfile

MY_RECEIPTS_DIR = "training_dataset"
OUTPUT_JSONL = "stage3_my_receipts.jsonl"
OUTPUT_ZIP = "stage3_my_receipts.zip"

PROMPT = (
    "You are an expert OCR AI."
    " Read this handwritten receipt carefully."
    " It contains Devanagari Hindi and English text."
    " Extract the items and their prices."
    " Format the output strictly as a JSON object containing an items array."
    " Each item should have item, category, and amount keys."
    " Do not add markdown blocks, conversation, or extra text."
    " Output ONLY the raw JSON."
)


def find_images(folder):
    results = []
    for ext in ["*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"]:
        results.extend(glob.glob(os.path.join(folder, "**", ext), recursive=True))
        results.extend(glob.glob(os.path.join(folder, ext)))
    return list(set(results))


def main():
    print("BUILDING MY PERSONAL RECEIPTS DATASET")
    print("=" * 50)

    if not os.path.exists(MY_RECEIPTS_DIR):
        print("ERROR: Folder not found: " + MY_RECEIPTS_DIR)
        return

    images = find_images(MY_RECEIPTS_DIR)
    print("Total images found: " + str(len(images)))

    records = []
    skipped_no_json = []

    for img_path in sorted(images):
        img_filename = os.path.basename(img_path)
        base = os.path.splitext(img_filename)[0]

        json_path = os.path.join(os.path.dirname(img_path), base + ".json")

        if not os.path.exists(json_path):
            print("SKIP (no JSON): " + img_filename)
            skipped_no_json.append(img_filename)
            continue

        try:
            with open(json_path, "r", encoding="utf-8") as jf:
                gt = json.load(jf)
            gt_str = json.dumps(gt, ensure_ascii=False, indent=2)
        except Exception as e:
            print("ERROR reading " + json_path + ": " + str(e))
            continue

        record = {
            "id": "myreceipt_" + base,
            "conversations": [
                {
                    "role": "user",
                    "value": "<img>" + img_filename + "</img>\n" + PROMPT
                },
                {
                    "role": "assistant",
                    "value": gt_str
                }
            ],
            "_abs": img_path
        }
        records.append(record)
        print("OK: " + img_filename)

    if not records:
        print("NO RECORDS BUILT.")
        print("Make sure each image has a .json file with the EXACT same name.")
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
    print("Records built  : " + str(len(records)))
    print("Skipped no JSON: " + str(len(skipped_no_json)))
    print("JSONL : " + OUTPUT_JSONL)
    print("ZIP   : " + OUTPUT_ZIP)
    print("=" * 50)

    if skipped_no_json:
        print("Images with NO matching JSON:")
        for name in skipped_no_json:
            print("  - " + name)


if __name__ == "__main__":
    main()