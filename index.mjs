// @ts-check
import { Client } from "discord.js";
import WebSocket from "ws";

let readyPayload = {};

const client = new Client({
  intents: parseInt(process.env.DISCORD_INTENTS || "37383"),
  shards: "auto",
});

const wss = new WebSocket.Server({
  port: parseInt(process.env.PORT || "6969"),
});

client.on("raw", (packet) => {
  if (packet.t === "READY") {
    console.log("Ready payload received from Discord.");
    readyPayload = packet;
  }
});

wss.on("connection", (ws) => {
  console.log(`New connection! Sending ready payload`);

  ws.send(
    JSON.stringify({
      op: 10,
      d: {
        heartbeat_interval: 45000,
      },
    })
  );

  client.on("raw", (packet) => {
    console.log(`Forwarding packet ${JSON.stringify(packet)}`);
    ws.send(JSON.stringify(packet));
  });

  ws.on("message", (message) => {
    const buffer = JSON.parse(message.toString());

    if (buffer.op === 2) {
      console.log(`Sending ready payload!`);
      ws.send(JSON.stringify(readyPayload));
    }
  });
});

client.login(process.env.DISCORD_TOKEN);
