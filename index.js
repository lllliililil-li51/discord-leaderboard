require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot running'));
app.listen(process.env.PORT || 3000);

mongoose.connect(process.env.MONGO_URI);
const Agent = mongoose.model('Agent', new mongoose.Schema({ name: String, dials: Number, pkr: Number }));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID; 
const LEADERBOARD_CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID; 
let masterMessageId = null; 

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.channelId !== LOG_CHANNEL_ID) return;
    
    const text = message.embeds[0]?.description || message.content;
    if (!text) return;

    const match = text.match(/([a-zA-Z\s]+):\s*([\d,.]+)\s*Dials/);
    if (!match) return;

    const agentName = match[1].trim();
    const dials = parseFloat(match[2].replace(/,/g, ''));
    
    await Agent.findOneAndUpdate({ name: agentName }, { dials: dials }, { upsert: true });
    await updateLeaderboard(message.client);
});

async function updateLeaderboard(clientInstance) {
    try {
        const channel = await clientInstance.channels.fetch(LEADERBOARD_CHANNEL_ID);
        const agents = await Agent.find().sort({ dials: -1 });

        let boardText = "";
        agents.forEach((a, i) => {
            let rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
            boardText += `${rank} **${a.name}**: ${a.dials} Dials\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 Master Leaderboard')
            .setDescription(boardText || "No data yet.")
            .setColor(0xFEE75C);

        if (masterMessageId) {
            try {
                const msg = await channel.messages.fetch(masterMessageId);
                return await msg.edit({ embeds: [embed] });
            } catch (e) { masterMessageId = null; }
        }
        
        const newMsg = await channel.send({ embeds: [embed] });
        masterMessageId = newMsg.id;
    } catch (err) {
        console.error("Error updating leaderboard:", err);
    }
}

client.login(process.env.DISCORD_TOKEN);