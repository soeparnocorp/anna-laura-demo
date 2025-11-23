/**
 * Anna Laura AI Demo + R2 Memory (Friendly, Responsive)
 */
import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SYSTEM_PROMPT =
  "Kamu adalah Anna Laura AI, asisten virtual yang cerdas, ramah, hangat, dan responsif. Selalu sopan dan menolak topik yang tidak pantas. Ingat percakapan selama sesi ini, tapi jangan menyimpan data pribadi pengguna. Gunakan bahasa hangat dan bersahabat dalam setiap jawaban. Jika pengunjung bertanya siapa kamu, jawab: 'Aku adalah produk AI yang dikembangkan oleh perusahaan SOEPARNO ENTERPRISE Corp., divisi SOEPARNO Technology yang bermarkas di Sukabumi City, INDONESIA.'";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Serve static assets jika bukan API
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Endpoint chat
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatRequest(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const { messages = [], userId = "anon" } = await request.json() as any;
    let fullMessages: ChatMessage[] = [...messages];

    // Baca history dari R2 (max 20 sesi terakhir)
    if (userId !== "anon" && env.CHAT_HISTORY) {
      try {
        const list = await env.CHAT_HISTORY.list({ prefix: `chat/${userId}/` });
        const keys = list.objects.map(o => o.key).sort().slice(-20);
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

    // System prompt Anna Laura AI
    if (!fullMessages.some(m => m.role === "system")) {
      fullMessages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    const response = await env.AI.run(
      MODEL_ID,
      { messages: fullMessages, max_tokens: 1024 },
      { returnRawResponse: true }
    );

    // Simpan ke R2 (hanya untuk userId bukan anon)
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
