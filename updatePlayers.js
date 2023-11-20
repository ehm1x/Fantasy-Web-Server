const MongoClient = require("mongodb").MongoClient;
const axios = require("axios");

async function run() {
  const client = new MongoClient("mongodb://127.0.0.1:27017", {
    useNewUrlParser: true,
  });
  await client.connect();
  const db = client.db("Player");
  const players = db.collection("playerList");
  //await players.drop(); // clear collection
  let { tradeValueTable, tradeMap } = await loadTradeData();
  updatePlayers(players);
}

run(); 

async function load(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch data from ${url}: ${error}`);
    throw error;
  }
}



async function updatePlayers(collection) {
  let allPlayerData = await loadPlayers();
  let { tradeValueTable, tradeMap } = await loadTradeData();
  for (let playerId of allPlayerIds) {
    let currentPlayer = allPlayerData[playerId];
    if (!currentPlayer) {
        console.error(`Player data not found for ID ${playerId}`);
        continue;
    }
    if (currentPlayer) {
      let currentName = `${currentPlayer.first_name} ${currentPlayer.last_name}`;
      console.log(`loading ${currentName} ${currentPlayer.player_id}`);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const weeklyProj = await load(`https://api.sleeper.com/projections/nfl/player/${currentPlayer.player_id}?season_type=regular&season=2023&grouping=week`) || {};
      const seasonProj = await load(`https://api.sleeper.com/projections/nfl/player/${currentPlayer.player_id}?season_type=regular&season=2023&grouping=season`) || {};
      const weeklyStats = await load(`https://api.sleeper.com/stats/nfl/player/${currentPlayer.player_id}?season=2023&season_type=regular&grouping=week`) || {};
      const seasonStats = await load(`https://api.sleeper.com/stats/nfl/player/${currentPlayer.player_id}?season=2023&season_type=regular&grouping=season`) || {};

      const projpts = Array(19).fill(0);
      const actualPts = Array(19).fill(0);

      const numWeeks = Object.keys(weeklyStats).filter(
        (key) => weeklyStats[key] !== null
      ).length;
      const total = seasonStats?.stats?.pts_ppr || 0;

      const actualWeeks = Object.values(weeklyStats);
      for (let actualWeek of actualWeeks) {
        if (actualWeek && actualWeek.stats && actualWeek.stats.pts_ppr) {
          actualPts[actualWeek.week] = actualWeek.stats.pts_ppr;
        } else {
          break;
        }
      }

      let currWeek = null;
      let activeWeeks = 0; 

      for (let i = 0; i < actualWeeks.length; i++) {
        if (actualWeeks[i] !== null) {
          currWeek = i;
        }
        if(actualWeeks[i].stats?.gms_active){
          activeWeeks++; 
        }
      }

      const avgActualPts = numWeeks !== 0 ? total / numWeeks : 0;
      const weeks = Object.values(weeklyProj);
      for (let week of weeks) {
        if (week && week.stats && week.stats.pts_ppr) {
          projpts[week.week] = week.stats.pts_ppr;
        }
      }

      let rosTotal = 0;

      for (let i = numWeeks; i < projpts.length; i++) {
        rosTotal += projpts[i];
      }

      const adp = seasonProj?.stats?.adp_ppr || 0;
      const projTotalPts = seasonProj?.stats?.pts_ppr || 0;
      const tradeValue = parseInt(
        tradeMap.has(currentName)
          ? tradeValueTable[tradeMap.get(currentName)][6]
          : 0
      );
      let avgProjPts = projTotalPts / 17;
      if (!currentPlayer || !seasonStats || !weeklyStats) continue; 
      let player = {
        name: `${seasonProj?.player?.first_name ?? ""} ${
          seasonProj?.player?.last_name ?? ""
        }`,
         adp: adp ?? 0,
      player_id: currentPlayer.player_id,
      weeklyProj: projpts ?? [],
      weeklyActualPts: actualPts ?? [],
      projTotalPts: projTotalPts ?? 0,
      avgProjPts: avgProjPts ?? 0,
      actualTotalPts: total ?? 0,
      avgActualPts: avgActualPts ?? 0,
      position: seasonProj?.player?.fantasy_positions[0] ?? "",
      tradeValue: tradeValue ?? 0,
      rosProjTotal: rosTotal ?? 0,
      tradePositionalRanking: 0,
      tradeOverallRanking: 0,
      statsPositionalRanking: seasonStats && seasonStats.stats ? seasonStats.stats.pos_rank_ppr ?? 999 : 999,
      statsOverallRanking: seasonStats && seasonStats.stats ? seasonStats.stats.rank_ppr ?? 999 : 999,
      injuryStats: currentPlayer.injury_status ?? "None",
      injuryBodyPart: currentPlayer.injury_body_part ?? "None",
      team: currentPlayer.team ?? "FA",
      active: currentPlayer.active ?? "N/A",
      weeklyStats: weeklyStats,
      weeklyProj: weeklyProj,
      seasonProj: seasonProj,
      seasonStats: seasonStats, 
      tradeValueColor: findTradeColor(tradeValue),
      currentWeek : currWeek ?? 0,
      activeWeeks : activeWeeks ?? 0,
    };
  
      try {
        await collection.insertOne(player);
        console.log(`loaded ${currentName} ${currentPlayer.player_id}`);
        // console.log(player); 
      } catch (err) {
        console.error("failed to save player", err);
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

async function loadTradeData() {
  let tradeValueTable = await axios.get(
    "https://statics.sportskeeda.com/skm/assets/trade-analyzer/players-json-list/v2/playersLists.json"
  );
  tradeValueTable = tradeValueTable.data;
  
  tradeValueTable = findLeagueType(tradeValueTable);
  for(let player of tradeValueTable){
    let name = player[0];
    //remove Jr./III from name
    name = name.replace(/(Jr.|Sr.|I|II|III|IV|V)$/g, "").trim();
    // console.log("'" + name + "'" )
    player[0] = name;
  }
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

function loadTradeMap(tradeValueTable, tradeMap) {
  for (let i = 1; i < tradeValueTable.length; i++) {
    const item = tradeValueTable[i];
    if (Array.isArray(item) && item.length > 0) {
      let name = item[0];
      //remove suffix from name
      tradeMap.set(name, i);
    }
  }
}


function findTradeColor(tradeValue){
  let boxClass = '';
  if (tradeValue > 75) {
    boxClass = 'yellow';
  } else if (tradeValue > 50) {
    boxClass = 'purple';
  } else if (tradeValue > 35) {
    boxClass = 'blue';
  } else if (tradeValue > 15) {
    boxClass = 'green';
  } else {
    boxClass = 'red';
  }
  return boxClass;
}

const fs = require("fs").promises;

async function loadPlayers() {
  let allPlayerData = await fs.readFile(
    "C:\\SatcomStuff\\players.json",
    "utf8"
  );
  return JSON.parse(allPlayerData);
}

let allPlayerIds = [
  8177, 7564, 3286, 4046, 8131, 10867, 11280, 1339, 1049, 4082, 11046, 7842, 8110, 5185, 1166, 8205, 10220, 8259, 1837, 2711, 260, 8475, 7066, 7812, 5906, 4037, 8500, 4574, 5773, 3634, 7496, 8147, 6083, 5121, 3225, 6804, 10232, 7583, 6111, 8154, 1348, 7561, 7538, 6904, 6130, 6768, 1373, 6790, 7601, 4127, 10955, 5844, 5870, 2197, 4666, 6820, 345, 7526, 9488, 8484, 4227, 7608, 1034, 3269, 8111, 6927, 7606, 6323, 7794, 11370, 11008, 11311, 1266, 10222, 829, 10228, 4943, 8136, 7049, 6075, 
  8119, 9231, 7159, 8138, 5995, 7828, 8134, 421, 3294, 7593, 5854, 2359, 8931, 7585, 8116, 6908, 3423, 4054, 7553, 2320, 5122, 11439, 9504, 5965, 6783, 5038, 6786, 6918, 9487, 11533, 2251, 3242, 7922, 6865, 2334, 7588, 6828, 2325, 7716, 6814, 8155, 5846, 7002, 6819, 11068, 5409, 4033, 9756, 5374, 4029, 6181, 5001, 2460, 9495, 4319, 6126, 2545, 
  862, 9505, 7527, 4314, 5880, 9753, 5850, 3391, 1433, 5086, 4958, 11256, 6151, 8210, 6451, 11034, 5220, 11114, 1426, 2422, 2505, 5095, 8139, 4464, 4017, 8214,  8126, 4144, 7050,
  6149, 1466, 2307, 9502, 11433, 5970, 9227, 312, 4972, 10231, 3199, 9758, 3257, 2747, 11435, 10871, 4683, 8140, 5113, 503, 8756, 4035, 6798, 9490, 6012, 8162, 3451, 10235, 10863, 7042, 2020, 9482, 8255, 7528, 886, 7559, 4718, 2390, 4089, 3200, 8127, 4098, 5096, 6850, 7594, 8122, 9492, 9497, 5045, 2446, 8168, 8235, 6528, 8489, 6853,
  9222, 9997, 6803, 5010, 7602, 9500, 650, 11053, 4984, 8144, 8114, 4198, 6938, 6894, 5235, 9754, 5008, 9230, 2381, 1067, 7992, 8411, 6794, 3202, 6074, 5012, 9224, 5154, 5857, 6136, 5089, 6011, 8230, 8228, 4951, 8161, 10212, 6002, 11199, 7600, 8121, 8150, 5890, 4197, 7611, 7670, 9757, 2319, 4018, 9225, 4995, 6931, 10218, 4454, 4950, 4199, 7554, 5927, 11306, 4854, 7571, 7075, 5046, 6845, 5285, 5127, 6290, 5892, 5189, 2152, 8159, 4218, 8195, 9508, 6824, 4323, 8583, 7757, 
  6001, 8192, 7543, 7567, 2449, 3678, 6943, 111, 11210, 11058, 5199, 6826, 10223, 4147, 4080, 5032, 5272, 8129, 9481, 7009, 7547, 2078, 10236, 8151, 8181, 6144, 1352, 7565, 1476, 7891, 1234, 7084, 8183, 6843, 6963, 4183, 7204, 4381, 1264, 1479, 2306, 7529, 4217, 7090, 
  10444, 10234, 5985, 7568, 6223, 7610, 3163, 9221, 6037, 10866, 4179, 8153, 10214, 10227, "WAS", "NO", "NE", "SEA", "BUF", 5937, 7567, "JAX", "DAL", "IND", "DET", "PIT", 4988, 6813, 5849, 4039, 5284, 8172, 8148, "SF", "PHI", "BAL", "KC", "MIA", 6770, 9229, 6598, 11371, 5848, 4177, 8112, 2749, 2028, 1992, 1945, 8118, 7525, 9509, 6234, 6869, 5323, 5955, 5248, 4993, 4973, 9494, 9226, 3050, 10229, 3357, 2374, 8917, 8221, 5133, 5695, 4602, 11082, 1689, 7436, 616, 5022,
//   4983, 5917, 4985, 10219, 10225, 6920, 6219, 6271, 8676, 8227, 17, 6945, 6886, 5903, 3164, 3048, 4066, 7523, 3976, 3214, 7045, 8142, 7536, 8130, 10213, 10217, 5967, 5119, 6662, 8170, 4866, 7771, 2309, 5134, 7591, 4455, 6699, 4034, 5859, 9479, 8160, 10224, 7729, 7946, 6926, 4171, 4981, 6996, 10226, 9493, 2750, 5257, 6847, 6694, 8143, 6885, 3198, 6984, 2410, 7703, 8253, 6909, 8223, 8157, 2161, 
//   8132, 7562, 2216, 8197, 6185, 8013, 3321, 8206, 4040, 5938, 8225, 11139, 7438, 4663, 5209, 8146, 7596, 9484, 7694, 8135, 5987, 8137, 7083, 7021, 4195, 5128, 8408, 5973, 10221, 9228, 6659, 7569, 7605, 1535, 3271, 5947, 9999, 8211, 8167, 7607, 9506, 928, 7106, 8145, 10862, 4137, 4892, 6650, 827, 9480, 5872, 2133, 10983, 10937, 4881, 1346, 9486, 1737, 9501, 8523, 8414, 2399, 4443, 4111, 10859, 6801, 6797, 8117, 7839, 7587, 7746, 8125, "ARI", "ATL", "CAR", "CIN", "CLE", "DEN", "GB", "HOU", "LAC", "LAR", "LV", "MIN", "NYG", "NYJ", "TEN", "TB", 4149, 5916, 4068, 3969, 6806, 5137, 9511
];
//reformat when prettier puts each one on a new line 

// let allPlayerIdsString = allPlayerIds.join(', ');
// console.log(allPlayerIdsString);


//plan to use this later 

// async function rankings() {
//   const cursor = players.find({ position: "DEF" }).sort({ tradeValue: -1 });
//   const playersArray = await cursor.toArray();

//   // Iterate over playersArray and update each document with its positional ranking
//   for (let i = 0; i < playersArray.length; i++) {
//     const player = playersArray[i];
//     await players.updateOne(
//       { _id: player._id },
//       { $set: { positionalRanking: i + 1 } } // i+1 because rankings start at 1, not 0
//     );
//   }
// }





