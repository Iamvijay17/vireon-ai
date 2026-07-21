// tts.js

import { Client } from "@gradio/client";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const SERVER = "http://127.0.0.1:7860";

async function generateAudio({
  text,
  language = "Auto",
  speaker = "Ryan",
  instruct = "",
  modelSize = "1.7B",
  seed = -1,
}) {
  try {
    const client = await Client.connect(SERVER);

    const result = await client.predict("/generate_custom_voice", {
      text,
      language,
      speaker,
      instruct,
      model_size: modelSize,
      seed,
    });

    const audio = result.data[0];
    const status = result.data[1];

    console.log("✅ Audio Generated");
    console.log("Audio:", audio);
    console.log("Status:", status);

    // Auto-download output audio
    if (audio && audio.url) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
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
  speaker: "Ryan",
  text: `
Good morning everyone. Today, I'd like to share an overview of our topic. We'll begin by understanding the basics, then explore the key concepts with real-world examples, and finally summarize the main takeaways. As we move through the presentation, think about how these ideas apply to everyday life. By the end, you'll have a clear understanding of the subject and why it matters. Thank you for your attention, and let's begin.
`,
})
  .then((audio) => {
    console.log("Generated File:");
    console.log(audio);
  })
  .catch(console.error);
