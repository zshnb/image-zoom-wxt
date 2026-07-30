#!/usr/bin/env python3

import base64
import json
import os
import signal
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

HOST_DIR = Path(__file__).resolve().parent
CONFIG_PATH = HOST_DIR / "config.json"
MAX_INPUT_BYTES = 16 * 1024 * 1024
MAX_OUTPUT_BYTES = 36 * 1024 * 1024
OUTPUT_CHUNK_BYTES = 524286
MODEL_NAMES = {
    "general-x4v3": "realesr-general-x4v3",
    "x4plus": "realesrgan-x4plus",
}
active_process = None


def send_message(message):
    encoded = json.dumps(message, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def read_message():
    length_bytes = sys.stdin.buffer.read(4)
    if not length_bytes:
        return None
    if len(length_bytes) != 4:
        raise ValueError("Invalid native message header")
    length = struct.unpack("=I", length_bytes)[0]
    if length > 64 * 1024 * 1024:
        raise ValueError("Native request is too large")
    payload = sys.stdin.buffer.read(length)
    if len(payload) != length:
        raise ValueError("Incomplete native request")
    return json.loads(payload)


def terminate_child(_signum=None, _frame=None):
    global active_process
    if active_process and active_process.poll() is None:
        active_process.terminate()
    raise SystemExit(0)


def load_config():
    with CONFIG_PATH.open(encoding="utf-8") as file:
        config = json.load(file)
    command = config.get("command")
    models = config.get("models")
    if not isinstance(command, str) or not os.path.isabs(command):
        raise ValueError("config.json command must be an absolute path")
    if not os.path.isfile(command) or not os.access(command, os.X_OK):
        raise ValueError("Configured ESRGAN command is not executable")
    if not isinstance(models, str) or not os.path.isabs(models):
        raise ValueError("config.json models must be an absolute path")
    if not os.path.isdir(models):
        raise ValueError("Configured ESRGAN model directory does not exist")
    return command, Path(models)


def resolve_model(models, requested_model):
    model = MODEL_NAMES.get(requested_model)
    if not model:
        raise ValueError("Unsupported ESRGAN model")
    if (
        (models / f"{model}.param").is_file()
        and (models / f"{model}.bin").is_file()
    ):
        return model
    if requested_model == "general-x4v3":
        fallback = MODEL_NAMES["x4plus"]
        if (
            (models / f"{fallback}.param").is_file()
            and (models / f"{fallback}.bin").is_file()
        ):
            return fallback
    raise ValueError(f"ESRGAN model files are missing: {model}")


def upscale(message, command, models):
    global active_process
    if message.get("type") != "upscale":
        raise ValueError("Unsupported request type")
    model = resolve_model(models, message.get("model"))
    image_base64 = message.get("imageBase64")
    if not isinstance(image_base64, str):
        raise ValueError("Missing image data")
    image_bytes = base64.b64decode(image_base64, validate=True)
    if not image_bytes or len(image_bytes) > MAX_INPUT_BYTES:
        raise ValueError("Input image size is invalid")

    with tempfile.TemporaryDirectory(prefix="image-zoom-esrgan-") as temp_dir:
        input_path = Path(temp_dir) / "input.png"
        output_path = Path(temp_dir) / "output.png"
        input_path.write_bytes(image_bytes)
        active_process = subprocess.Popen(
            [
                command,
                "-i",
                str(input_path),
                "-o",
                str(output_path),
                "-m",
                str(models),
                "-n",
                model,
                "-s",
                "4",
                "-f",
                "png",
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=sys.stderr,
        )
        return_code = active_process.wait()
        active_process = None
        if return_code != 0:
            raise RuntimeError(f"ESRGAN exited with status {return_code}")
        if not output_path.is_file():
            raise RuntimeError("ESRGAN did not create an output image")
        output_size = output_path.stat().st_size
        if not output_size or output_size > MAX_OUTPUT_BYTES:
            raise ValueError("ESRGAN output size is invalid")

        with output_path.open("rb") as output:
            index = 0
            while chunk := output.read(OUTPUT_CHUNK_BYTES):
                send_message({
                    "type": "chunk",
                    "index": index,
                    "data": base64.b64encode(chunk).decode("ascii"),
                })
                index += 1
        send_message({"type": "complete", "mimeType": "image/png"})


def main():
    signal.signal(signal.SIGTERM, terminate_child)
    signal.signal(signal.SIGINT, terminate_child)
    command, models = load_config()
    while message := read_message():
        try:
            upscale(message, command, models)
        except Exception as error:
            print(f"[ImageZoom Native Host] {error}", file=sys.stderr)
            send_message({"type": "error", "error": str(error)[:500]})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"[ImageZoom Native Host] {error}", file=sys.stderr)
        send_message({"type": "error", "error": str(error)[:500]})
