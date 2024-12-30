document.addEventListener('DOMContentLoaded', async () => {
    // Cache DOM elements
    const fetchStatsButton = document.getElementById('fetchStats');
    const settingsButton = document.getElementById('settings-button');
    const matchLinkInput = document.getElementById('matchLink');
    const overlay = document.getElementById('loading-overlay');
    const overlayText = document.getElementById('loading-text');
    const teamAMapStatsElement = document.getElementById('teamA-map-stats');
    const teamBMapStatsElement = document.getElementById('teamB-map-stats');
    const teamAPlayerStatsElement = document.getElementById('teamA-player-stats');
    const teamBPlayerStatsElement = document.getElementById('teamB-player-stats');

    // Handle external links to open in the default browser
    const externalLinks = document.querySelectorAll('a.external-link');
    externalLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            window.api.openExternal(link.href);
        });
    });


    // Fetch Stats Handler
    const handleFetchStats = async () => {
        const matchLink = matchLinkInput.value.trim();

        if (!matchLink) {
            alert('Please enter a valid match link.');
            return;
        }

        showLoadingOverlay('Fetching match data...');
        try {
            const matchData = await fetchMatchData(matchLink);
            updateUI(matchData.faction1Stats.mapStats, matchData.faction1Stats.playerStats, teamAMapStatsElement, teamAPlayerStatsElement);
            updateUI(matchData.faction2Stats.mapStats, matchData.faction2Stats.playerStats, teamBMapStatsElement, teamBPlayerStatsElement);
        } catch (error) {
            console.error('Error fetching match data:', error);
            alert('Failed to fetch match data. Please try again.');
        } finally {
            hideLoadingOverlay();
        }
    };

    // Open Settings Handler
    settingsButton.addEventListener('click', () => {
        window.api.openSettings();
    });

    // Attach event listener to the Fetch Stats button
    fetchStatsButton.addEventListener('click', handleFetchStats);

    // Show loading overlay
    const showLoadingOverlay = (text) => {
        overlayText.textContent = text;
        overlay.style.display = 'flex';
    };

    // Hide loading overlay
    const hideLoadingOverlay = () => {
        overlay.style.display = 'none';
    };

    // Update UI with stats
    const updateUI = (mapStats, playerStats, mapStatsElement, playerStatsElement) => {
        // Clear existing table rows
        mapStatsElement.innerHTML = '';
        playerStatsElement.innerHTML = '';

        // Update map stats
        for (const map in mapStats) {
            const mapStat = mapStats[map];
            const mapRow = document.createElement('tr');
            mapRow.innerHTML = `
                <td style="background-image: url('./../../../assets/maps/${map}.jpg');">${map}</td>
                <td>${mapStat.played}</td>
                <td>${mapStat.wins}</td>
                <td>${mapStat.scores.join(' || ')}</td>
            `;
            mapStatsElement.appendChild(mapRow);
        }

        // Update player stats
        for (const player in playerStats) {
            const stats = playerStats[player];
            const playerRow = document.createElement('tr');
            playerRow.innerHTML = `
                <td>${stats.nickname}</td>
                <td>${stats.matches}</td>
                <td>${stats.kills}</td>
                <td>${stats.deaths}</td>
                <td>${stats.averageKD}</td>
                <td>${stats.assists}</td>
                <td>${stats.triple_kills}</td>
                <td>${stats.quadro_kills}</td>
                <td>${stats.penta_kills}</td>
                <td>${stats.headshot_percentage}</td>
                <td>${stats.mvps}</td>
            `;
            playerStatsElement.appendChild(playerRow);
        }
    };

    const fetchMatchData = async (matchLink) => {
        try {
            const matchId = extractMatchId(matchLink); // Assume a utility to extract match ID
    
            // Fetch match data using the API
            const apiKey = await window.api.loadSetting('apiKey'); // Securely retrieve the API key
            if (!apiKey) {
                throw new Error('API Key is not set. Please configure it in settings.');
            }
    
            const response = await fetch(`https://open.faceit.com/data/v4/matches/${matchId}`, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
    
            if (!response.ok) {
                throw new Error(`Failed to fetch match data: ${response.statusText}`);
            }
    
            const matchData = await response.json();
            if (matchData.competition_type != 'championship') {
                throw new Error('The requested match is not part of a Faceit Championship.')
            }

            const competitionId = matchData.competition_id;
            const faction1Id = matchData.teams.faction1.faction_id;
            const faction2Id = matchData.teams.faction2.faction_id;

            const allMatches = await getRelevantMatches(competitionId, faction1Id, faction2Id);
            const matchStats = await getAllMatchStats(allMatches);
    
            // Process match data
            return processMatchData(matchStats, faction1Id, faction2Id);
    
        } catch (error) {
            console.error(error.message);
            alert(`Error: ${error.message}`);
        }
    }

    const getRelevantMatches = async (competitionId, faction1Id, faction2Id) => {
        
        const apiKey = await window.api.loadSetting('apiKey'); // Securely retrieve the API key
        if (!apiKey) {
            throw new Error('API Key is not set. Please configure it in settings.');
        }
    
        let offset = 0;
        const limit = 100;
        let allMatches = [];

        try {
            while(true) {
                const response = await fetch(`https://open.faceit.com/data/v4/championships/${competitionId}/matches?type=past&offset=${offset}&limit=${limit}`, {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch matches: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                
                const filteredMatches = data.items.filter(match =>
                    match.teams.faction1.faction_id === faction1Id || 
                    match.teams.faction2.faction_id === faction1Id ||
                    match.teams.faction1.faction_id === faction2Id || 
                    match.teams.faction2.faction_id === faction2Id
                ).map(match => match.match_id);

                allMatches = allMatches.concat(filteredMatches);
                if(data.items.length < limit){
                    break;
                }

                offset += limit;
            }

            console.log(`Fetched ${allMatches.length} matches in total.`);
            return allMatches;

        } catch (error) {
            console.error(`Error fetching matches: ${error.message}`);
            return [];
        }
    };
    
    const processMatchData = (matchStats, faction1Id, faction2Id) => {
    
        let result = { faction1Stats: {}, faction2Stats: {}};

        result.faction1Stats.mapStats = calculateMapStats(matchStats, faction1Id);
        result.faction1Stats.playerStats = calculatePlayerStats(matchStats, faction1Id);

        result.faction2Stats.mapStats = calculateMapStats(matchStats, faction2Id);
        result.faction2Stats.playerStats = calculatePlayerStats(matchStats, faction2Id);


        return result;
    }

    const getAllMatchStats = async (matchIds) => {
        const apiKey = await window.api.loadSetting('apiKey'); // Securely retrieve the API key
        if (!apiKey) {
            throw new Error('API Key is not set. Please configure it in settings.');
        }

        const matchStats = [];

        try {
            for(let i = 0; i < matchIds.length; i++) {
                const response = await fetch(`https://open.faceit.com/data/v4/matches/${matchIds[i]}/stats`, {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch matches: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                matchStats.push(data);
            }
        } catch (error) {
            console.error(`Error fetching matches: ${error.message}`);
            return [];
        }

        return matchStats;
    }

    const calculateMapStats = (matchStats, factionId) => {
        const mapStats = {};

        matchStats.forEach(game => {
            game.rounds.forEach(match => {
                if(match.teams[0].team_id == factionId || match.teams[1].team_id == factionId){
                    let stats = match.round_stats;
                    let mapName = stats.Map;
                    if (!mapStats[mapName]) {
                        mapStats[mapName] = {
                            played: 0,
                            wins: 0,
                            scores: [],
                        };
                    }
                    mapStats[mapName].played++;
        
                    if(stats.Winner == factionId){
                        mapStats[mapName].wins++;
                        mapStats[mapName].scores.push(stats.Score.replace(' ', ''));
                    }
                    else {
                        mapStats[mapName].scores.push(stats.Score.split('/').reverse().join('/').trim());
                    }
                }
            });
        });
    
        return mapStats;
    }

    const calculatePlayerStats = (matchStats, factionId) => {
        const playerStats = {};

        matchStats.forEach(game => {
            game.rounds.forEach(match => {
                if(match.teams[0].team_id == factionId || match.teams[1].team_id == factionId){
                    let team = match.teams[0].team_id == factionId ? match.teams[0] : match.teams[1];
                    team.players.forEach(player => {
                        if(!playerStats[player.player_id]){
                            playerStats[player.player_id] = {
                                nickname: player.nickname,
                                matches: 0,
                                utilityDamage: 0,
                                flashSuccessRatePerMatch: 0,
                                knifeKills: 0,
                                damage: 0,
                                flashSuccesses: 0,
                                utilitySuccessRatePerMatch: 0,
                                sniperKills: 0,
                                enemiesFlashedPerRound: 0,
                                oneVoneWins: 0,
                                oneVtwoCount: 0,
                                tripleKills: 0,
                                match1v2WinRate: 0,
                                clutchKills: 0,
                                matchEntryRate: 0,
                                zeusKills: 0,
                                mvps: 0,
                                enemiesFlashed: 0,
                                oneVtwoWins: 0,
                                pistolKills: 0,
                                flashCount: 0,
                                matchEntrySuccessRate: 0,
                                kills: 0,
                                headshotPercentage: 0,
                                utilityCount: 0,
                                pentaKills: 0,
                                adr: 0,
                                deaths: 0,
                                sniperKillRatePerRound: 0,
                                entryWins: 0,
                                utilityUsagePerRound: 0,
                                entryCount: 0,
                                headshots: 0,
                                assists: 0,
                                flashesPerRound: 0,
                                utilityEnemies: 0,
                                oneVoneCount: 0,
                                utilityDamageSuccessRatePerMatch: 0,
                                doubleKills: 0,
                                firstKills: 0,
                                kd: 0,
                                kr: 0,
                                match1v1Winrate: 0,
                                quadroKills: 0,
                                utilityDamegePerRound: 0,
                            }
                        }
    
                        if(!playerStats[player.player_id].nickname.includes(player.nickname)){
                            playerStats[player.player_id].nickname += ` || ${player.nickname}`;
                        };
                        playerStats[player.player_id].matches++;
                        playerStats[player.player_id].utilityDamage += parseFloat(player.player_stats["Utility Damage"]);
                        playerStats[player.player_id].FlashSuccessRatePerMatch += parseFloat(player.player_stats["Flash Success Rate per Match"]);
                        playerStats[player.player_id].knifeKills += parseFloat(player.player_stats["Knife Kills"]);
                        playerStats[player.player_id].damage += parseFloat(player.player_stats["Damage"]);
                        playerStats[player.player_id].flashSuccesses += parseFloat(player.player_stats["Flash Successes"]);
                        playerStats[player.player_id].utilitySuccessRatePerMatch += parseFloat(player.player_stats["Utility Success Rate per Match"]);
                        playerStats[player.player_id].sniperKillRatePerRound += parseFloat(player.player_stats["Sniper Kill Rate per Match"]);
                        playerStats[player.player_id].sniperKills += parseFloat(player.player_stats["Sniper Kills"]);
                        playerStats[player.player_id].enemiesFlashedPerRound += parseFloat(player.player_stats["Enemies Flashed per Round in a Match"]);
                        playerStats[player.player_id].oneVoneWins += parseFloat(player.player_stats["1v1Wins"]);
                        playerStats[player.player_id].oneVtwoCount += parseFloat(player.player_stats["1v2Count"]);
                        playerStats[player.player_id].tripleKills += parseFloat(player.player_stats["Triple Kills"]);
                        playerStats[player.player_id].match1v2WinRate += parseFloat(player.player_stats["Match 1v2 Win Rate"]);
                        playerStats[player.player_id].clutchKills += parseFloat(player.player_stats["Clutch Kills"]);
                        playerStats[player.player_id].matchEntryRate += parseFloat(player.player_stats["Match Entry Rate"]);
                        playerStats[player.player_id].zeusKills += parseFloat(player.player_stats["Zeus Kills"]);
                        playerStats[player.player_id].mvps += parseFloat(player.player_stats["MVPs"]);
                        playerStats[player.player_id].enemiesFlashed += parseFloat(player.player_stats["Enemies Flashed"]);
                        playerStats[player.player_id].oneVtwoWins += parseFloat(player.player_stats["1v2Wins"]);
                        playerStats[player.player_id].pistolKills += parseFloat(player.player_stats["Pistol Kills"]);
                        playerStats[player.player_id].flashCount += parseFloat(player.player_stats["Flash Count"]);
                        playerStats[player.player_id].matchEntrySuccessRate += parseFloat(player.player_stats["Match Entry Success Rate"]);
                        playerStats[player.player_id].kills += parseFloat(player.player_stats["Kills"]);
                        playerStats[player.player_id].headshotPercentage += parseFloat(player.player_stats["Headshots %"]);
                        playerStats[player.player_id].utilityCount += parseFloat(player.player_stats["Utility Count"]);
                        playerStats[player.player_id].pentaKills += parseFloat(player.player_stats["Penta Kills"]);
                        playerStats[player.player_id].adr += parseFloat(player.player_stats["ADR"]);
                        playerStats[player.player_id].deaths += parseFloat(player.player_stats["Deaths"]);
                        playerStats[player.player_id].sniperKillRatePerRound += parseFloat(player.player_stats["Sniper Kill Rate per Round"]);
                        playerStats[player.player_id].entryWins += parseFloat(player.player_stats["Entry Wins"]);
                        playerStats[player.player_id].utilityUsagePerRound += parseFloat(player.player_stats["Utility Usage per Round"]);
                        playerStats[player.player_id].entryCount += parseFloat(player.player_stats["Entry Count"]);
                        playerStats[player.player_id].headshots += parseFloat(player.player_stats["Headshots"]);
                        playerStats[player.player_id].assists += parseFloat(player.player_stats["Assists"]);
                        playerStats[player.player_id].flashesPerRound += parseFloat(player.player_stats["Flashes per Round in a Match"]);
                        playerStats[player.player_id].utilityEnemies += parseFloat(player.player_stats["Utility Enemies"]);
                        playerStats[player.player_id].oneVoneCount += parseFloat(player.player_stats["1v1Count"]);
                        playerStats[player.player_id].utilityDamageSuccessRatePerMatch += parseFloat(player.player_stats["Utility Damage Success Rate per Match"]);
                        playerStats[player.player_id].doubleKills += parseFloat(player.player_stats["Double Kills"]);
                        playerStats[player.player_id].firstKills += parseFloat(player.player_stats["First Kills"]);
                        playerStats[player.player_id].kd += parseFloat(player.player_stats["K/D Ratio"]);
                        playerStats[player.player_id].kr += parseFloat(player.player_stats["K/R Ratio"]);
                        playerStats[player.player_id].match1v1Winrate += parseFloat(player.player_stats["Match 1v1 Win Rate"]);
                        playerStats[player.player_id].quadroKills += parseFloat(player.player_stats["Quadro Kills"]);
                        playerStats[player.player_id].utilityDamegePerRound += parseFloat(player.player_stats["Utility Damage per Round in a Match"]);
                    });
                }
            });
        });
    
        return playerStats;
    }
    
    const extractMatchId = (matchLink) => {
        const matchIdRegex = /https:\/\/www\.faceit\.com\/[a-z]+\/cs2\/room\/([a-zA-Z0-9-]+)(?:\/scoreboard)?/;
        const matchIdMatch = matchLink.match(matchIdRegex);

        if (matchIdMatch && matchIdMatch[1]) {
            return matchIdMatch[1];
        } else {
            throw new Error("Invalid match link. Please provide a valid Faceit matchroom link.");
        }
    }
});
