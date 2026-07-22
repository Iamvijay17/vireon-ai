"""
Forced-alignment helper for caption sync.

The Qwen3-TTS Gradio API only returns the generated audio file + a status
string - no per-word timing. Since it's synthetic speech reading back a
known script (not noisy real-world audio), running faster-whisper's ASR
with word_timestamps=True on the finished clip gives timestamps accurate
enough to treat as ground truth for caption sync.

Usage: python alignCaptions.py <audio_file_path> [model_size]
Prints a JSON array of {word, start, end} (seconds) to stdout.
On any failure, prints "[]" and exits 0 - callers should treat this as
"no timestamps available" and fall back to estimated pacing rather than
fail the whole audio-generation step over a caption nicety.
"""
import sys
import json


def main():
    if len(sys.argv) < 2:
        print("[]")
        return

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"

    try:
        from faster_whisper import WhisperModel

        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, _ = model.transcribe(audio_path, word_timestamps=True)

        words = []
        for segment in segments:
            for word in segment.words or []:
                words.append({
                    "word": word.word.strip(),
                    "start": round(word.start, 3),
                    "end": round(word.end, 3),
                })

        print(json.dumps(words))
    except Exception as exc:  # noqa: BLE001 - this is a best-effort helper
        sys.stderr.write(f"alignCaptions failed: {exc}\n")
        print("[]")


if __name__ == "__main__":
    main()
