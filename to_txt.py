import os
import json
from datetime import datetime
import base64


def convert_blind_files(directory):
    if not os.path.isdir(directory):
        print("❌ Not a valid directory.")
        return

    today = datetime.now().date()

    print(f"\n📂 Scanning directory: {directory}\n")

    for filename in os.listdir(directory):
        if not filename.endswith(".blind"):
            continue

        full_path = os.path.join(directory, filename)

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            coded_string = data.get("content_b64", "")
            text = base64.b64decode(coded_string).decode("utf-8")
            title = data.get("title", "")
            unlock_date_str = data.get("unlock_date", None)

            if not unlock_date_str:
                print(f"⚠️ {filename}: missing unlockDate → skipping")
                continue

            unlock_date = datetime.strptime(unlock_date_str, "%Y-%m-%d").date()

            if unlock_date > today:
                print(f"🔒 {filename}: locked until {unlock_date_str}")
                continue

            # Create .txt filename
            txt_filename = filename.replace(".blind", ".txt").replace("blindtype", "untitled" if not title else title)
            txt_path = os.path.join(directory, txt_filename)

            # Write the text into a .txt file
            with open(txt_path, "w", encoding="utf-8") as txt_file:
                txt_file.write(text)

            print(f"✅ Converted: {filename} → {txt_filename}")

        except Exception as e:
            print(f"❌ Failed to process {filename}: {e}")

    print("\n🎉 Done.\n")


if __name__ == "__main__":
    directory = input("Enter directory containing .blind files: ").strip()
    convert_blind_files(directory)
