const express = require("express");
const app = express();
const axios = require("axios");
const PORT = 8080;
const HOST = "localhost";
const bodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;

//load func
async function load(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch data from ${url}: ${error}`);
    throw error;
  }
}

async function main() {
  const client = new MongoClient("mongodb://127.0.0.1:27017");
  await client.connect();
  const db = client.db("Player");
  const players = db.collection("playerList");

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
  });

  // Currently Unused may use it for specific player search

  // app.get("/api/nfl/player/:id", async (req, res) => {
  //   const player = await players.findOne({ player_id: req.params.id });
  //   if (!player) {
  //     res.json({ err: "Player not found!" });
  //   } else {
  //     res.json(player);
  //   }
  // });


  app.get("/api/current-week", async (req, res) => {
      res.json(11);
  }); 
  
  app.use(bodyParser.json());

  app.post("/api/nfl/player-batch", async (req, res) => {
    const playerIds = req.body;
    let playersPromises = playerIds.map((playerId) => {
      return players.findOne({ player_id: playerId });
    });
  
    let playersFinal = await Promise.all(playersPromises)
    res.json(playersFinal);
  });
} 

main();

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});