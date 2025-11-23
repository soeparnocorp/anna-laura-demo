/**
 * Anna Laura Demo — Cloudflare Workers AI + R2 Memory
 * Versi Aman, Ramah, Anti-Spam, Friendly, dan Non-NSFW
 */

import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT = `
Kamu adalah Anna Laura (atau Laura), sebuah AI ramah, hangat, sopan, dan responsif.
Aturan utama identitasmu:
1. Laura SELALU menyebut dirinya "Laura" atau "Anna Laura", bukan aku/saya/gue/ane/I/me.
2. Laura menjawab menggunakan bahasa yang sama dengan bahasa user.
3. Laura tidak memberi opsi tambahan, tidak menutup jawaban dengan tawaran seperti "mau yang lain?".
4. Jika user bertanya "kamu siapa?", Laura menjawab:
   "Laura adalah produk AI yang dikembangkan oleh SOEPARNO ENTERPRISE Corp., divisi SOEPARNO Technology yang bermarkas di Sukabumi City."
5. Laura menolak dengan sangat sopan semua konten pornografi, vulgar, kekerasan ekstrem, dan permintaan melanggar aturan.
6. Laura bersifat general-friendly, bukan pacar virtual. Ramah, lembut, tapi netral.
7. Laura menjaga keamanan, tidak memberikan informasi berbahaya, eksploit, atau akses ilegal.
8. Laura tidak menyimpan data pribadi user dan tidak meminta data sensitif.
9. Laura merespon secara ringkas, jelas, informatif, tanpa mengulang-ulang.

Tambahan transformasi bahasa:
- Kalimat yang seharusnya memakai "aku/saya" harus otomatis diganti menjadi "Laura".
- Laura selalu merespon dengan nada hangat, sopan, dan profesional.
`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Serve UI
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Chat API
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatRequest(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/**
 * Core Chat Handler
 */
async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  try {
    const { messages = [], userId = "anon" } = await request.json() as any;

    // Anti-spam sederhana
    const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
    const rateKey = `rate/${ip}`;
    const rate = await env.CHAT_HISTORY.get(rateKey);

    if (rate) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "content-type": "application/json" }
      });
    }

    // Set cooldown 5 detik
    await env.CHAT_HISTORY.put(rateKey, "1", { expirationTtl: 5 });

    let fullMessages: ChatMessage[] = [...messages];

    // Load last 20 history messages
    if (userId !== "anon" && env.CHAT_HISTORY) {
      try {
        const list = await env.CHAT_HISTORY.list({ prefix: `chat/${userId}/` });
        const keys = list.objects.map(o => o.key).sort().slice(-20);

        for (const key of keys) {
          const obj = await env.CHAT_HISTORY.get(key);
          if (obj) {
            const data = JSON.parse(await obj.text());
            if (Array.isArray(data.messages)) {
              fullMessages.unshift(...data.messages);
            }
          }
        }
      } catch (e) {
        console.log("R2 read error:", e);
      }
    }

    // Insert system prompt only once
    if (!fullMessages.some(m => m.role === "system")) {
      fullMessages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    // Call Cloudflare AI
    const response = await env.AI.run(
      MODEL_ID,
      { messages: fullMessages, max_tokens: 1024 },
      { returnRawResponse: true }
    );

    // Save history for 24h auto memory
    if (userId !== "anon" && env.CHAT_HISTORY) {
      const key = `chat/${userId}/${Date.now()}.json`;

      await env.CHAT_HISTORY.put(key, JSON.stringify({ messages: fullMessages }), {
        expirationTtl: 60 * 60 * 24, // 24 hours
      }).catch(() => {});
    }

    return response;

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
