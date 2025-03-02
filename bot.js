require("dotenv").config();
const tmi = require("tmi.js");

const client = new tmi.Client({
    options: { debug: true },
    connection: { reconnect: true, secure: true },
    identity: {
        username: process.env.TWITCH_BOT_USERNAME,
        password: process.env.TWITCH_OAUTH_TOKEN,
    },
    channels: [process.env.TWITCH_CHANNEL],
});

client.connect();

client.on("message", (channel, tags, message, self) => {
    if (self) return;
    if (message.toLowerCase() === "!track") {
        client.say(channel, `@${tags.username}, трек сейчас недоступен, но скоро будет! 🎵`);
    }
});

module.exports = client;
