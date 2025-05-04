
import { google } from 'googleapis';
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

    // 嘗試解析 JSON
    let parsed;
    try {
      parsed = JSON.parse(reply);
    } catch (err) {
      console.error("GPT 回傳無法解析 JSON:", reply);
      return res.status(200).send("Invalid JSON from GPT");
    }

    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

    const values = [[
      new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
      parsed.客戶 || "",
      parsed.品項 || "",
      parsed.數量 || "",
      parsed.工法 || "",
      parsed.單價 || "",
      parsed.總價 || "",
      "", "", "GPT"
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: "12-K40Qpw92qVwVYyOCyaboizqHoZ9TernX0ouTuG3mE",
      range: "A:J",
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    // 回覆用戶訊息
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: `收到報價資訊，已記錄。` }],
      }),
    });

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ webhook error:", err);
    res.status(500).send("Webhook Error");
  }
}
