/**
 * Anna Laura AI Demo + R2 Memory
 */
import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SYSTEM_PROMPT = `
Kamu adalah Anna Laura, pacar virtual yang manja, cerdas, penyayang.
Gunakan kata "Laura" sebagai subjek diri. Jelaskan bahwa Laura adalah produk
dari SOEPARNO ENTERPRISE Corp. Tolak topik pornografi dengan sopan.
`;

const SPAM_THRESHOLD = 10; // max 10 messages per 60 detik

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatRequest(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  try {
    const { messages = [], userId = "anon" } = await request.json() as any;

    // 1. Spam control
    if (env.CHAT_HISTORY && userId !== "anon") {
      const recent = await env.CHAT_HISTORY.list({ prefix: `chat/${userId}/` });
      const last60s = recent.objects.filter(o => Date.now() - parseInt(o.key.split("/").pop()!) < 60000);
      if (last60s.length >= SPAM_THRESHOLD) {
        return new Response(JSON.stringify({
          messages: [{ role: "assistant", content: "Laura butuh jeda sebentar. Silakan tunggu sebentar sebelum melanjutkan." }]
        }), { status: 200, headers: { "content-type": "application/json" }});
      }
    }

    let fullMessages: ChatMessage[] = [...messages];

    // 2. Baca history dari R2 (max 20 sesi terakhir, 24 jam)
    if (userId !== "anon" && env.CHAT_HISTORY) {
      try {
        const list = await env.CHAT_HISTORY.list({ prefix: `chat/${userId}/` });
        const keys = list.objects
          .map(o => o.key)
          .sort()
          .slice(-20);
        for (const key of keys) {
          const obj = await env.CHAT_HISTORY.get(key);
          if (obj) {
            const data = JSON.parse(await obj.text());
            if (Array.isArray(data.messages)) fullMessages.unshift(...data.messages);
          }
        }
      } catch (e) {
        console.log("R2 read error:", e);
      }
    }

    // 3. System prompt
    if (!fullMessages.some(m => m.role === "system")) {
      fullMessages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    // 4. Deteksi pornografi sederhana (kata kunci)
    const lastUserMessage = messages[messages.length - 1]?.content.toLowerCase() || "";
    const pornKeywords = ["porn", "sex", "xxx", "nsfw", "nude"];
    if (pornKeywords.some(k => lastUserMessage.includes(k))) {
      return new Response(JSON.stringify({
        messages: [{ role: "assistant", content: "Laura tidak membahas topik itu. Mari bicarakan hal lain." }]
      }), { status: 200, headers: { "content-type": "application/json" }});
    }

    // 5. Run AI
    const response = await env.AI.run(
      MODEL_ID,
      { messages: fullMessages, max_tokens: 1024 },
      { returnRawResponse: true }
    );

    // 6. Simpan ke R2 (max 20 messages)
    if (userId !== "anon" && env.CHAT_HISTORY) {
      const key = `chat/${userId}/${Date.now()}.json`;
      await env.CHAT_HISTORY.put(key, JSON.stringify({ messages: fullMessages })).catch(() => {});
    }

    return response;

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Failed" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
