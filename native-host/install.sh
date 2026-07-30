#!/bin/sh
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 EXTENSION_ID /absolute/path/to/realesrgan-ncnn-vulkan [MODEL_DIR]" >&2
  exit 1
fi

extension_id=$1
esrgan_command=$2

case "$extension_id" in
  *[!a-p]*|'')
    echo "Invalid Chrome extension ID: $extension_id" >&2
    exit 1
    ;;
esac

if [ "${esrgan_command#/}" = "$esrgan_command" ] || [ ! -x "$esrgan_command" ]; then
  echo "ESRGAN command must be an absolute executable path" >&2
  exit 1
fi

if [ "$#" -eq 3 ]; then
  models=$3
else
  binary_dir=$(CDPATH= cd -- "$(dirname -- "$esrgan_command")" && pwd)
  if [ -d "$binary_dir/../models" ]; then
    models=$(CDPATH= cd -- "$binary_dir/../models" && pwd)
  elif [ -d "$binary_dir/models" ]; then
    models=$(CDPATH= cd -- "$binary_dir/models" && pwd)
  else
    echo "Model directory was not found; pass it as the third argument" >&2
    exit 1
  fi
fi

if [ "${models#/}" = "$models" ]; then
  echo "Model directory must be an absolute path" >&2
  exit 1
fi

if [ ! -f "$models/realesrgan-x4plus.param" ] \
  || [ ! -f "$models/realesrgan-x4plus.bin" ]; then
  echo "Model directory must contain realesrgan-x4plus.param and .bin" >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    install_dir="$HOME/Library/Application Support/ImageZoomNativeHost"
    manifest_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  Linux)
    install_dir="$HOME/.local/share/image-zoom-native-host"
    manifest_dir="$HOME/.config/google-chrome/NativeMessagingHosts"
    ;;
  *)
    echo "This installer currently supports macOS and Linux" >&2
    exit 1
    ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$install_dir" "$manifest_dir"
cp "$script_dir/host.py" "$install_dir/host.py"
chmod 755 "$install_dir/host.py"

/usr/bin/python3 - "$install_dir/config.json" "$esrgan_command" "$models" <<'PY'
import json
import sys

with open(sys.argv[1], "w", encoding="utf-8") as file:
    json.dump({"command": sys.argv[2], "models": sys.argv[3]}, file)
PY

/usr/bin/python3 - \
  "$manifest_dir/com.image_zoom.esrgan.json" \
  "$install_dir/host.py" \
  "$extension_id" <<'PY'
import json
import sys

manifest = {
    "name": "com.image_zoom.esrgan",
    "description": "Local Real-ESRGAN bridge for Image Zoom",
    "path": sys.argv[2],
    "type": "stdio",
    "allowed_origins": [f"chrome-extension://{sys.argv[3]}/"],
}
with open(sys.argv[1], "w", encoding="utf-8") as file:
    json.dump(manifest, file, indent=2)
PY

echo "Installed com.image_zoom.esrgan for extension $extension_id"
echo "Models: $models"
