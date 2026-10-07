"""
Forced-alignment helper for caption sync.

The Qwen3-TTS Gradio API only returns the generated audio file + a status
string - no per-word timing. Since it's synthetic speech reading back a
known script (not noisy real-world audio), running faster-whisper's ASR
with word_timestamps=True on the finished clip gives timestamps accurate
enough to treat as ground truth for caption sync.

Usage: python alignCaptions.py <audio_file_path> [model_size]
       python alignCaptions.py --batch <model_size> <file> [<file> ...]
Prints a JSON array of {word, start, end, probability} (seconds) to stdout
(batch mode: one array per line, one line per file).
On any failure, prints "[]" and exits 0 - callers should treat this as
"no timestamps available" and fall back to estimated pacing rather than
fail the whole audio-generation step over a caption nicety.
"""
import sys
import json


def align_file(model, audio_path):
    segments, _ = model.transcribe(audio_path, word_timestamps=True)
    words = []
    for segment in segments:
        for word in segment.words or []:
            words.append({
                "word": word.word.strip(),
                "start": round(word.start, 3),
                "end": round(word.end, 3),
                "probability": round(float(word.probability), 3),
            })
    return words


def main():
    args = sys.argv[1:]
    if not args:
        print("[]")
        return

    # Batch mode: `alignCaptions.py --batch [model_size] file1 file2 ...`
    # loads the model once and prints one JSON array per input file, in
    # order. A scene's segments are aligned in one process this way instead
    # of paying the model load for every clip.
    batch = args[0] == "--batch"
    if batch:
        model_size = args[1]
        files = args[2:]
    else:
        files = [args[0]]
        model_size = args[1] if len(args) > 1 else "base"

    try:
        from faster_whisper import WhisperModel

        model = WhisperModel(model_size, device="cpu", compute_type="int8")
    except Exception as exc:  # noqa: BLE001 - this is a best-effort helper
        sys.stderr.write(f"alignCaptions failed to load model: {exc}\n")
        for _ in files:
            print("[]")
        return

    for audio_path in files:
        try:
            print(json.dumps(align_file(model, audio_path)))
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"alignCaptions failed for {audio_path}: {exc}\n")
            print("[]")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
