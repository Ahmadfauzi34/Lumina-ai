import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const chat = ai.chats.create({ model: 'gemini-3.1-flash-lite-preview' });

async function run() {
  try {
    const input = [
      { text: "hello" }
    ];
    // try to send
    const stream = await chat.sendMessageStream(input as any);
    for await (const chunk of stream) {
      console.log(chunk.text);
    }
  } catch (e: any) {
    console.error("ERROR Array with text:", e.message);
  }

  try {
    const inputParam = { message: "hello param" };
    // try to send
    const stream = await chat.sendMessageStream(inputParam);
    for await (const chunk of stream) {
      console.log(chunk.text);
    }
  } catch (e: any) {
    console.error("ERROR param wrapper:", e.message);
  }

  try {
    const inputParam = { message: [{text: "hello array wrapped"}] };
    // try to send
    const stream = await chat.sendMessageStream(inputParam);
    for await (const chunk of stream) {
      console.log(chunk.text);
    }
  } catch (e: any) {
    console.error("ERROR param wrapper with array:", e.message);
  }
}

run();
