// @ts-check
import { Client, GatewayDispatchEvents, GatewayOpcodes } from "discord.js";
import WebSocket from "ws";

let readyPayload = {};
let helloPayload = {};
let backfill = [];

const client = new Client({
  intents: parseInt(process.env.DISCORD_INTENTS || "37383"),
  shards: "auto",
});

const wss = new WebSocket.Server({
  port: parseInt(process.env.PORT || "6969"),
});

console.log(`[Park] Listening on ws://localhost:${wss.options.port}`);

function broadcastClients(packet) {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(packet));
    }
  });
}

const DONT_SEND_TO_CLIENT_PARK_OPCODES = [GatewayOpcodes.HeartbeatAck];
const BACKFILL_EVENTS = [GatewayDispatchEvents.GuildCreate];

/**
 * Discord -> Park
 */
client.on("raw", (packet) => {
  if (packet.op === GatewayOpcodes.Hello) {
    console.log("[Discord -> Park] Hello payload received from Discord.");
    helloPayload = packet;
    return;
  }

  if (packet.t === GatewayDispatchEvents.Ready) {
    console.log(
      `[Discord -> Park] Ready payload received from Discord. | ${packet.d.guilds.length} guilds.`
    );
    readyPayload = packet;
    return;
  }

  if (DONT_SEND_TO_CLIENT_PARK_OPCODES.includes(packet.op)) {
    return;
  }

  if (BACKFILL_EVENTS.includes(packet.t)) {
    backfill.push(packet);
  }

  broadcastClients(packet);
});

/**
 * Park -> Discord
 */

const DONT_SEND_TO_DISCORD_OPCODES = [
  GatewayOpcodes.Heartbeat,
  GatewayOpcodes.HeartbeatAck,
];

let currentHeartbeat = 0;

/**
 * @param {WebSocket} ws
 */
function handleHeartbeat(ws) {
  ws.send(
    JSON.stringify({
      op: GatewayOpcodes.HeartbeatAck,
      d: currentHeartbeat === 0 ? null : currentHeartbeat,
    })
  );
  console.log(
    `[Park -> Client] Ack'd heartbeat | Up to ${currentHeartbeat} beats.`
  );
  currentHeartbeat++;
}

wss.on("connection", (ws, req) => {
  console.log(
    `[Client 🤝 Park] New connection from ${req.socket.remoteAddress} sending hello payload.`
  );
  ws.send(JSON.stringify(helloPayload));

  ws.on("message", (message) => {
    const buffer = JSON.parse(message.toString());

    if (buffer.op === GatewayOpcodes.Identify) {
      console.log(
        `[Cache -> Client] Sending ready payload! Then backfilling guilds.`
      );
      ws.send(JSON.stringify(readyPayload));
      backfill.forEach((packet) => {
        ws.send(JSON.stringify(packet));
      });
      return;
    }

    if (buffer.op === GatewayOpcodes.Heartbeat) {
      return void handleHeartbeat(ws);
    }

    if (DONT_SEND_TO_DISCORD_OPCODES.includes(buffer.op)) {
      return;
    }

    if (buffer.d && buffer.d.token) {
      buffer.d.token = client.token;
    }

    console.log(buffer);

    console.log(
      `[Client -> Discord] Forwarding packet ${
        buffer.t || buffer.op || "UNKNOWN"
      }`
    );

    // @ts-ignore - Accessing private property
    client.ws.broadcast(JSON.stringify(buffer));
  });
});

client.login(process.env.DISCORD_TOKEN);
