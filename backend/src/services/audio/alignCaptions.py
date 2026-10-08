"""
Forced-alignment helper for caption sync.

The Qwen3-TTS Gradio API only returns the generated audio file + a status
string - no per-word timing. Since it's synthetic speech reading back a
known script (not noisy real-world audio), running faster-whisper's ASR
with word_timestamps=True on the finished clip gives timestamps accurate
enough to treat as ground truth for caption sync.

Usage: python alignCaptions.py <audio_file_path> [model_size]
       python alignCaptions.py --batch <model_size> <file> [<file> ...]
       python alignCaptions.py --jobs <model_size>     (JSON job list on stdin)
Prints a JSON array of {word, start, end, probability} (seconds) to stdout
(batch mode: one array per line, one line per file).
--jobs mode reads [{"file", "language"?, "prompt"?}, ...] from stdin and prints
one {"words": [...], "duration": seconds, "language": code} object per line;
it is what the speech alignment service uses (language + vocabulary prompt).
On any failure, prints "[]" and exits 0 - callers should treat this as
"no timestamps available" and fall back to estimated pacing rather than
fail the whole audio-generation step over a caption nicety.
"""
import os
import sys
import json


def align_file(model, audio_path, language=None, prompt=None):
    # condition_on_previous_text=False: each clip is a short, independent
    # sentence, and carrying text across them only invites repetition loops.
    segments, info = model.transcribe(
        audio_path,
        word_timestamps=True,
        language=language or None,
        initial_prompt=prompt or None,
        condition_on_previous_text=False,
    )
    words = []
    for segment in segments:
        for word in segment.words or []:
            words.append({
                "word": word.word.strip(),
                "start": round(word.start, 3),
                "end": round(word.end, 3),
                "probability": round(float(word.probability), 3),
            })
    return words, info


def load_model(model_size):
    from faster_whisper import WhisperModel

    # Capped threads: this runs next to the GPU workers and Remotion on the
    # same machine; letting ctranslate2 take every core stalls the box.
    threads = int(os.environ.get("ALIGNMENT_CPU_THREADS", "4"))
    return WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=threads)


def run_jobs(model_size):
    try:
        jobs = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"alignCaptions could not read jobs: {exc}\n")
        return

    try:
        model = load_model(model_size)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"alignCaptions failed to load model: {exc}\n")
        for _ in jobs:
            print("null")
        return

    for job in jobs:
        try:
            words, info = align_file(model, job["file"], job.get("language"), job.get("prompt"))
            print(json.dumps({
                "words": words,
                "duration": round(float(info.duration), 3),
                "language": info.language,
            }))
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"alignCaptions failed for {job.get('file')}: {exc}\n")
            print("null")
        sys.stdout.flush()


def main():
    args = sys.argv[1:]
    if not args:
        print("[]")
        return

    if args[0] == "--jobs":
        run_jobs(args[1] if len(args) > 1 else "base")
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
        model = load_model(model_size)
    except Exception as exc:  # noqa: BLE001 - this is a best-effort helper
        sys.stderr.write(f"alignCaptions failed to load model: {exc}\n")
        for _ in files:
            print("[]")
        return

    for audio_path in files:
        try:
            words, _ = align_file(model, audio_path)
            print(json.dumps(words))
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"alignCaptions failed for {audio_path}: {exc}\n")
            print("[]")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
