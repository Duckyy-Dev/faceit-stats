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
    const teamAName = document.getElementById('teamAName');
    const teamBName = document.getElementById('teamBName');

    const tables = document.querySelectorAll(".table-container");
    const tableHeaders = document.querySelectorAll(".playerStatsTable thead th");
    const contextMenu = document.createElement("div");
    contextMenu.classList.add("context-menu");
    document.body.appendChild(contextMenu);
    const addedKeys = new Set();

    function logMessage(level, message) {
        window.api.log(level, message);
    }

    let hiddenColumnsSetting = await window.api.loadSetting('hiddenColumns');

    let hiddenColumns = hiddenColumnsSetting == null ? new Set(['headshots', 'damage', 'flashCount', 'flashSuccesses', 'enemiesFlashed', 'utilityEnemies', 'utilityCount',
            'doubleKills', 'tripleKills', 'quadroKills', 'pentaKills', 'entryWins', 'firstKills', 'oneVoneWins', 'oneVtwoWins',
            'zeusKills', 'mvps', 'pistolKills', 'knifeKills'])
            : new Set(JSON.parse(hiddenColumnsSetting));
	
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
            logMessage('error', `Error fetching match data: ${error}`);
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
                <td style="background-image: url('./../../../assets/maps/${map}.jpg');background-position: center; background-size: cover; height: 30px;width: 150px;color: white; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);">${map}</td>
                <td>${mapStat.played}</td>
                <td>${mapStat.wins}</td>
                <td>${mapStat.scores.join(' || ')}</td>
            `;
            mapStatsElement.appendChild(mapRow);
        }

        // Update player stats
        for (const player in playerStats) {
            addPlayerRow(playerStats[player], playerStatsElement);
        }
    };

    const addPlayerRow = (player, tablebody) => {
        const row = document.createElement("tr");
    
        for (const key in player) {
            const cell = document.createElement("td");
            cell.dataset.key = key;
            cell.textContent = player[key];
            row.appendChild(cell);
        }
        
        tablebody.appendChild(row);
        applyColumnVisibility();
    }

    const fetchMatchData = async (matchLink) => {
        try {
            const matchId = extractMatchId(matchLink); // Assume a utility to extract match ID
    
            // Fetch match data using the API
            const apiKey = await window.api.loadSetting('apiKey'); // Securely retrieve the API key
            if (!apiKey) {
                logMessage('info', `API Key is not set. Please configure it in settings.`);
                throw new Error('API Key is not set. Please configure it in settings.');
            }
    
            const response = await fetch(`https://open.faceit.com/data/v4/matches/${matchId}`, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
    
            if (!response.ok) {
                logMessage('error', `Failed to fetch match data: ${response.statusText}`);
                throw new Error(`Failed to fetch match data: ${response.statusText}`);
            }
    
            const matchData = await response.json();
            if (matchData.competition_type != 'championship') {
                logMessage('info', 'The requested match is not part of a Faceit Championship.');
                throw new Error('The requested match is not part of a Faceit Championship.')
            }

            const competitionId = matchData.competition_id;
            const faction1Id = matchData.teams.faction1.faction_id;
            const faction2Id = matchData.teams.faction2.faction_id;

            teamAName.innerHTML = matchData.teams.faction1.name;
            teamBName.innerHTML = matchData.teams.faction2.name;


            const allMatches = await getRelevantMatches(competitionId, faction1Id, faction2Id);
            const matchStats = await getAllMatchStats(allMatches);

            const notAnalyzed = allMatches.length - matchStats.length;
            if(notAnalyzed > 0){
                alert(`No stats gathered for ${notAnalyzed} defwins/deflosses`);
            }
    
            // Process match data
            return processMatchData(matchStats, faction1Id, faction2Id);
    
        } catch (error) {
            logMessage('error', error.message);
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
        } catch (error) {
            logMessage('error', `Error fetching matches: ${error.message}`);
        }
        finally {
            logMessage('info', `Fetched ${allMatches.length} matches in total.`);
            return allMatches;
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

        for(let i = 0; i < matchIds.length; i++) {
            try {
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
            catch (error) {
                logMessage('error', `Error fetching matches: ${error.message}`);
            }
        } 
        logMessage('info', `Fetched ${matchStats.length} / ${matchIds.length} matches`);
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
                    }
                    mapStats[mapName].scores.push(formatMatchResult(stats.Score, match.teams[0].team_id == factionId));
                }
            });
        });
    
        return mapStats;
    }

    const formatMatchResult = (score, isFirstTeam) => {
        score = score.replaceAll(' ', '');
        if(isFirstTeam){
            return score;
        }
        if(!isFirstTeam){
            return score.split('/').reverse().join('/');
        }
    }

    const calculatePlayerStats = (matchStats, factionId) => {
        let playerStats = {};

        matchStats.forEach(game => {
            game.rounds.forEach(match => {
                if(match.teams[0].team_id == factionId || match.teams[1].team_id == factionId){
                    let team = match.teams[0].team_id == factionId ? match.teams[0] : match.teams[1];
                    team.players.forEach(player => {
                        if(!playerStats[player.player_id]){
                            playerStats[player.player_id] = {
                                nickname: player.nickname,
                                matches: 0,
                                kills: 0,
                                deaths: 0,
                                kd: 0,
                                adr: 0,
                                headshotPercentage: 0,
                                headshots: 0,
                                kr: 0,
                                assists: 0,
                                damage: 0,
                                utilityDamage: 0,
                                flashesPerRound: 0,
                                flashCount: 0,
                                flashSuccesses: 0,
                                flashSuccessRatePerMatch: 0,
                                enemiesFlashed: 0,
                                enemiesFlashedPerRound: 0,
                                utilityEnemies: 0,
                                utilityCount: 0,
                                utilityDamegePerRound: 0,
                                utilityDamageSuccessRatePerMatch: 0,
                                utilitySuccessRatePerMatch: 0,
                                utilityUsagePerRound: 0,
                                sniperKills: 0,
                                sniperKillRatePerRound: 0,
                                clutchKills: 0,
                                doubleKills: 0,
                                tripleKills: 0,
                                quadroKills: 0,
                                pentaKills: 0,
                                matchEntryRate: 0,
                                entryCount: 0,
                                entryWins: 0,
                                entrySuccessRate: 0,
                                firstKills: 0,
                                oneVoneWins: 0,
                                oneVoneCount: 0,
                                match1v1Winrate: 0,
                                oneVtwoWins: 0,
                                oneVtwoCount: 0,
                                match1v2WinRate: 0,
                                zeusKills: 0,
                                mvps: 0,
                                pistolKills: 0,
                                knifeKills: 0
                            }
                        }
    
                        if(!playerStats[player.player_id].nickname.includes(player.nickname)){
                            playerStats[player.player_id].nickname += ` || ${player.nickname}`;
                        };
                        playerStats[player.player_id].matches++;
                        playerStats[player.player_id].utilityDamage += parseFloat(player.player_stats["Utility Damage"]);
                        playerStats[player.player_id].flashSuccessRatePerMatch += parseFloat(player.player_stats["Flash Success Rate per Match"]);
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
                        playerStats[player.player_id].entrySuccessRate += parseFloat(player.player_stats["Match Entry Success Rate"]);
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

        for(let playerId of Object.keys(playerStats)){
            let player = playerStats[playerId];
            for (let key in player) {
                if(typeof player[key] === 'number' && key != "matches")
                    player[key] = (player[key] / player["matches"]).toFixed(2);
            }
        }
    
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

    const applyColumnVisibility = () => {
        tables.forEach((table) => {
            const tableHeaders = table.querySelectorAll("thead th");
            const tableRows = table.querySelectorAll("tbody tr");
    
            // Toggle visibility of the headers
            tableHeaders.forEach((th) => {
                const colKey = th.dataset.key;
                th.style.display = hiddenColumns.has(colKey) ? "none" : "";
            });
    
            // Toggle visibility of the cells
            tableRows.forEach((row) => {
                Array.from(row.children).forEach((cell) => {
                    const colKey = cell.dataset.key;
                    cell.style.display = hiddenColumns.has(colKey) ? "none" : "";
                });
            });
        });
    }

    // Populate context menu with checkboxes for each column
    tableHeaders.forEach((header) => {
        const key = header.dataset.key;

        if (!addedKeys.has(key)) {
            addedKeys.add(key);
            const label = header.textContent;
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = hiddenColumns == null ? true : !hiddenColumns.has(key); // adjust to default/saved configuration
            checkbox.dataset.key = key;
    
            const labelElement = document.createElement("label");
            labelElement.textContent = label;
            labelElement.prepend(checkbox);
            contextMenu.appendChild(labelElement);
            contextMenu.appendChild(document.createElement("br"));
    
            // Toggle column visibility when checkbox is clicked
            checkbox.addEventListener("change", async (event) => {
                const isChecked = event.target.checked;
                const colKey = event.target.dataset.key;

                if (isChecked) {
                    hiddenColumns.delete(colKey);
                } 
                else {
                    hiddenColumns.add(colKey);
                }

                await window.api.saveSetting('hiddenColumns', JSON.stringify([...hiddenColumns]));
                applyColumnVisibility();
            });
        }
    });

    // Show context menu on right-click
    tables.forEach((table) => {
        table.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            const { clientX: mouseX, clientY: mouseY } = event;
            contextMenu.style.left = `${mouseX}px`;
            contextMenu.style.top = `${mouseY}px`;
            contextMenu.style.display = "block";
        });
    });

    // Stop propagation of clicks inside the context menu
    contextMenu.addEventListener("click", (event) => {
        event.stopPropagation(); // Prevent hiding the menu when clicking inside it
    });

    // Hide context menu when clicking elsewhere
    document.addEventListener("click", () => {
        contextMenu.style.display = "none";
    });

    // Apply the default column visibility on startup
    applyColumnVisibility();
});
