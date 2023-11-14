const express = require("express");
const app = express();
const router = express.Router();
const axios = require("axios");
const PORT = 8080;
const HOST = "localhost";
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
app.use(express.json());
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

//connect and shit

async function main() {
  let username;
  let userData;
  let userId;
  let leaguesData;
  let teamVec;
  let leagueNum = 7;
  let leagueId;
  let leagueUsers, leagueTeams;
  username = "brycedoes";
  allPlayerData = await load("https://api.sleeper.app/v1/players/nfl");

  const client = new MongoClient("mongodb://127.0.0.1:27017");
  await client.connect();
  const db = client.db("Player");
  const players = db.collection("playerList");

  let { tradeValueTable, tradeMap } = await loadTradeData();

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
  });

  app.get("/api/nfl/player/:id", async (req, res) => {
    const player = await players.findOne({ player_id: req.params.id });
    if (!player) {
      res.json({ err: "Player not found!" });
    } else {
      res.json(player);
    }
  });

  app.use(bodyParser.json());

  app.post("/api/nfl/player-batch", async (req, res) => {
    const playerIds = req.body;
    console.log(playerIds)
    let playersPromises = playerIds.map((playerId) => {
      return players.findOne({ player_id: playerId });
    });
  
    let playersFinal = await Promise.all(playersPromises)
    res.json(playersFinal);
  });
} 
main();
async function qbRankings(players) {
  try {
    let result = await players
      .find({ position: "QB" })
      .sort({ tradeValue: -1 })
      .toArray();
    return result;
  } catch (err) {
    console.error(err);
  }
}

function loadTradeMap(tradeValueTable, tradeMap) {
  for (let i = 1; i < tradeValueTable.length; i++) {
    const item = tradeValueTable[i];
    if (Array.isArray(item) && item.length > 0) {
      tradeMap.set(item[0], i);
    }
  }
}

async function loadTradeData() {
  let tradeValueTable = await axios.get(
    "https://statics.sportskeeda.com/skm/assets/trade-analyzer/players-json-list/v2/playersLists.json"
  );
  tradeValueTable = tradeValueTable.data;

  tradeValueTable = findLeagueType(tradeValueTable);

  let tradeMap = new Map();
  loadTradeMap(tradeValueTable, tradeMap);

  return {
    tradeValueTable,
    tradeMap,
  };
}

function findLeagueType(tradeValueTable) {
  let leagueType = -1;
  for (let i = 0; i <= 11; i++) {
    if (
      tradeValueTable.playersListsCollections[i].sheetName ===
      "redraft___1qb_ppr"
    ) {
      leagueType = i;
      console.log("[SUCCESS] Found league type.");
    }
  }

  if (leagueType !== -1) {
    return tradeValueTable.playersListsCollections[leagueType].playersList;
  } else {
    console.log("League type not found.");
    return null; // or handle the case where league type is not found
  }
}

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

function findLeagueType(tradeValueTable) {
  let leagueType = -1;
  for (let i = 0; i <= 11; i++) {
    if (
      tradeValueTable.playersListsCollections[i].sheetName ===
      "redraft___1qb_ppr"
    ) {
      leagueType = i;
      console.log("[SUCCESS] Found league type.");
    }
  }

  if (leagueType !== -1) {
    return tradeValueTable.playersListsCollections[leagueType].playersList;
  } else {
    console.log("League type not found.");
    return null; // or handle the case where league type is not found
  }
}

function loadTradeMap(tradeValueTable, tradeMap) {
  for (let i = 1; i < tradeValueTable.length; i++) {
    const item = tradeValueTable[i];
    if (Array.isArray(item) && item.length > 0) {
      tradeMap.set(item[0], i);
    }
  }
}

async function printAllTeams(teams, collection) {
  for (let team of teams) {
    await printTeam(team, collection);
  }
}

async function printTeam(team, collection) {
  console.log(`Team: ${team.teamName}\n`);

  console.log(
    `${"Position".padEnd(10)} ${"Name".padEnd(22)} ${"ADP".padEnd(
      10
    )} ${"Season Total".padEnd(15)} ${"Avg PTS per Week".padEnd(
      20
    )} ${"Trade Value:".padEnd(10)}`
  );

  //sort

  for (let id of team.roster) {
    let player = await getPlayerData(collection, id);
    if (
      !player ||
      player.adp === undefined ||
      player.projTotalPts === undefined ||
      player.avgProjPts === undefined ||
      player.tradeValue === undefined
    ) {
      console.error("Invalid player object", player);
      continue;
    }

    console.log(
      `${player.position.padEnd(10)} ${player.name.padEnd(22)} ${player.adp
        .toString()
        .padStart(10)} ${player.projTotalPts
        .toString()
        .padStart(15)} ${player.avgProjPts
        .toFixed(2)
        .padStart(20)} ${player.tradeValue.toString().padStart(10)}`
    );
  }
}

class Team {
  constructor(tName, owner) {
    this.teamName = tName || "";
    this.owner_id = owner;
    this.roster = [];
    this.totalPts = 0;
    this.totalWeekly = 0;
    this.totalTradeValue = 0;
  }

  initPlayer(player) {
    this.roster.push(player);
  }

  calcTotalPts() {
    this.totalPts = this.roster.reduce(
      (total, player) => total + player.projTotalPts,
      0
    );
  }

  avgWeekly() {
    this.totalWeekly = this.roster.reduce(
      (total, player) => total + player.avgProj,
      0
    );
  }

  calcTotalTrade() {
    this.totalTradeValue = this.roster.reduce(
      (total, player) => total + player.tradeValue,
      0
    );
  }
  find_adp() {
    let size = this.roster.length;
    let total = 0.0;
    for (let player of this.roster) {
      if (player.adp === undefined) {
        size--;
        continue;
      }
      total += player.adp;
    }
    if (size > 0) {
      total /= size;
    } else {
      return 999.99;
    }
    return total;
  }
}

constructTeams = async (
  leagueUsers,
  leagueTeams,
  allPlayerData,
  tradeValueTable,
  client,
  db,
  players
) => {
  const teams = leagueUsers.map(async (userTeam) => {
    const team = new Team(userTeam.display_name, userTeam.user_id);

    const roster = leagueTeams.find(
      (roster) => roster.owner_id === userTeam.user_id
    );
    let errorOccurred = false;

    for (const newPlayer of roster.players) {
      const currentPlayer = allPlayerData[newPlayer];
      const currentName = `${currentPlayer.first_name} ${currentPlayer.last_name}`;
      //console.log(`loading ${currentName} ${currentPlayer.player_id}`);
      const player = await players.findOne({ name: currentName });
      if (!player) {
        console.error(`No player found with the name ${currentName}`);
        errorOccurred = true;
        break; // exit the loop if a player wasn't found
      }
      team.roster.push(player._id.toString());
      if (!player._id.toString()) {
        console.log(player);
      }
    }
    // team.calcTotalPts();
    // team.avgWeekly();
    // team.calcTotalTrade();
    return team;
  });

  return Promise.all(teams);
};
// app.listen(3000);

const { ObjectId } = require("mongodb");

async function getPlayerData(playersCollection, playerId) {
  // Convert the playerId string into an ObjectId
  const _id = new ObjectId(playerId);

  // Query the players collection for the player with this _id
  const player = await playersCollection.findOne({ _id });

  if (!player) {
    console.error(`No player found with the ID ${playerId}`);
    return null;
  }

  return player;
}
