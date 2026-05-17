import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const stream = await ai.chats.create({
    model: 'gemini-3.1-pro-preview',
    config: { thinkingConfig: { thinkingBudget: 1024 } },
  }).sendMessageStream({message: 'How many Rs in Strawberry?'});
  for await (const chunk of stream) {
    console.log(JSON.stringify(chunk.candidates?.[0]?.content?.parts));
  }
}
run().catch(console.error);
