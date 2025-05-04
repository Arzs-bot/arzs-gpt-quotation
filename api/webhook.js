import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message" || event.message.type !== "text") {
      return res.status(200).send("No valid message");
    }

    const messageText = event.message.text;
    const userId = event.source.userId;

    // === Step 1: Call GPT API to extract quotation info ===
    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "請從報價句子中抽取 客戶、品項、數量、工法、單價，以 JSON 格式輸出。" },
          { role: "user", content: messageText },
        ],
      }),
    });

    const gptData = await gptResponse.json();
    const reply = gptData.choices?.[0]?.message?.content || "解析失敗";

    let parsed;
    try {
      parsed = JSON.parse(reply);
    } catch (err) {
      console.error("❌ GPT 回傳無法解析 JSON:", reply);
      return res.status(200).send("Invalid JSON from GPT");
    }

    // === Step 2: Send data to Google Apps Script webhook ===
    await fetch("https://script.google.com/macros/s/AKfycbyk6GzlBNlbY2wo2IC-xaKMZxESf9gMiyj8bcdizfv7rxfQiUoALEBx-bZ-J_AeyaU/exec", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        客戶: parsed.客戶 || "",
        品項: parsed.品項 || "",
        數量: parsed.數量 || "",
        工法: parsed.工法 || "",
        單價: parsed.單價 || "",
        總價: parsed.總價 || "",
        rawMessage: messageText
      }),
    });

    // === Step 3: Reply to LINE user ===
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: `✅ 報價資訊已記錄` }],
      }),
    });

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ webhook error:", err);
    res.status(500).send("Webhook Error");
  }
}
