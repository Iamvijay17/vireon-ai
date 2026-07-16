// tts.js

import { Client } from "@gradio/client";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SERVER = "http://127.0.0.1:7860";

async function generateAudio({
   referenceAudio,
   referenceText,
   text,
   removeSilence = false,
   randomizeSeed = true,
   seed = 0,
   crossFade = 0.15,
   nfe = 32,
   speed = 1.0,
}) {
  try {
    const client = await Client.connect(SERVER);

    // Read reference audio file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const audioBuffer = readFileSync(join(__dirname, referenceAudio));
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });

    const result = await client.predict("/basic_tts", {
      ref_audio_input: audioBlob,
      ref_text_input: referenceText,
      gen_text_input: text,

      remove_silence: removeSilence,
      randomize_seed: randomizeSeed,
      seed_input: seed,
      cross_fade_duration_slider: crossFade,
      nfe_slider: nfe,
      speed_slider: speed,
    });

    const audio = result.data[0];
    const spectrogram = result.data[1];
    const detectedReferenceText = result.data[2];
    const usedSeed = result.data[3];

    console.log("✅ Audio Generated");
    console.log("Audio:", audio);
    console.log("Spectrogram:", spectrogram);
    console.log("Reference Text:", detectedReferenceText);
    console.log("Seed:", usedSeed);

    // Auto-download output audio
    if (audio && audio.url) {
      const outputResponse = await fetch(audio.url);
      const outputAudioBuffer = await outputResponse.arrayBuffer();
      const outputPath = join(__dirname, "output_audio.mp3");
      writeFileSync(outputPath, Buffer.from(outputAudioBuffer));
      console.log("Audio downloaded and saved to:", outputPath);
    }

    return audio;
  } catch (err) {
    console.error("TTS Error:", err);
    throw err;
  }
}

// ----------------------------
// Example
// ----------------------------

generateAudio({
  referenceAudio: "./audio_sample_male.mp3", // path to reference voice
  referenceText: "",
  text: `
Good morning everyone. Today, I'd like to share an overview of our topic. We'll begin by understanding the basics, then explore the key concepts with real-world examples, and finally summarize the main takeaways. As we move through the presentation, think about how these ideas apply to everyday life. By the end, you'll have a clear understanding of the subject and why it matters. Thank you for your attention, and let's begin.
`,
})
  .then((audio) => {
    console.log("Generated File:");
    console.log(audio);
  })
  .catch(console.error);
