const { createApp } = Vue;

createApp({
    data() {
        return {
            fieldCount: 1,
            clFieldCount: 0,
            teams: [],
            newTeam: { name: '', league: 'CL' },
            schedule: { CL: [], BL: [] },
            results: { CL: {}, BL: {} },
            // schedule options
            returnLegs: true,
            // timer
            timeLeft: 0,
            timerVisible: false,
            timerLength: 7, // minutes
            timerSize: 'small',
            timerId: null,
            showTimerAlert: false,
            // round navigation
            currentRoundCL: 1,
            currentRoundBL: 1
        };
    },
    computed: {
        pct() {
            return this.timerSeconds ? this.timeLeft / this.timerSeconds : 0;
        },
        timerSeconds() {
            return this.timerLength * 60;
        },
        formattedTime() {
            const m = Math.floor(this.timeLeft / 60);
            const s = this.timeLeft % 60;
            return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        },
        maxRoundCL() {
            return this.schedule.CL.reduce((m,r) => Math.max(m,r.round), 0);
        },
        maxRoundBL() {
            return this.schedule.BL.reduce((m,r) => Math.max(m,r.round), 0);
        },
        roundLabelCL() {
            const max = this.maxRoundCL;
            return max ? `${this.currentRoundCL} / ${max}` : '-';
        },
        roundLabelBL() {
            const max = this.maxRoundBL;
            return max ? `${this.currentRoundBL} / ${max}` : '-';
        },
        standingsCL() {
            return this.computeStandings('CL');
        },
        standingsBL() {
            return this.computeStandings('BL');
        },
        standingsAll() {
            const all = [];
            ['CL','BL'].forEach(lg => {
                Object.keys(this.results[lg] || {}).forEach(team => {
                    const rounds = this.results[lg][team] || [];
                    const total = rounds.reduce((s,v)=>s + (parseFloat(v)||0),0);
                    all.push({ team, total });
                });
            });
            return all.sort((a,b)=>b.total - a.total);
        },
        // create grid for visual field view per round
        matchGridCL() {
            const grid = [];
            const roundMatches = this.schedule.CL.filter(g => g.round === this.currentRoundCL);
            const hasAnyMatch = roundMatches.length > 0;
            for (let f = 1; f <= this.clFieldCount; f++) {
                const m = roundMatches.find(g => g.field === f);
                if (m) {
                    const status = m.home && m.away ? 'Spiel' : 'Pause';
                    grid.push({ field: f, home: m.home, away: m.away, status });
                } else {
                    grid.push({ field: f, home: '', away: '', status: hasAnyMatch ? 'Pause' : 'Frei' });
                }
            }
            return grid;
        },
        matchGridBL() {
            const grid = [];
            const roundMatches = this.schedule.BL.filter(g => g.round === this.currentRoundBL);
            const hasAnyMatch = roundMatches.length > 0;
            for (let f = this.clFieldCount + 1; f <= this.fieldCount; f++) {
                const m = roundMatches.find(g => g.field === f);
                if (m) {
                    const status = m.home && m.away ? 'Spiel' : 'Pause';
                    grid.push({ field: f, home: m.home, away: m.away, status });
                } else {
                    grid.push({ field: f, home: '', away: '', status: hasAnyMatch ? 'Pause' : 'Frei' });
                }
            }
            return grid;
        },
        waitingMatchesCL() {
            return this.schedule.CL.filter(m => m.round === this.currentRoundCL && m.field === null && m.home && m.away);
        },
        waitingMatchesBL() {
            return this.schedule.BL.filter(m => m.round === this.currentRoundBL && m.field === null && m.home && m.away);
        }
    },
    watch: {
        teams: {
            handler: 'saveState',
            deep: true
        },
        fieldCount: 'saveState',
        clFieldCount: 'saveState',
        timerLength: {
            handler: function() {
                if (!this.timerId) {
                    this.timeLeft = this.timerSeconds;
                }
                this.saveState();
            }
        },
        timerSize: 'saveState',
        returnLegs: 'saveState',
        timerVisible: 'saveState',
        schedule: {
            handler: 'saveState',
            deep: true
        },
        results: {
            handler: 'saveState',
            deep: true
        },
        currentRoundCL: 'saveState',
        currentRoundBL: 'saveState'
    },
    created() {
        this.loadState();
    },
    methods: {
        addTeam() {
            const name = this.newTeam.name.trim();
            if (!name) return;
            this.teams.push({ name, league: this.newTeam.league });
            this.newTeam.name = '';
        },
        removeTeam(index) {
            this.teams.splice(index, 1);
        },
        generateSchedule() {
            if (this.clFieldCount > this.fieldCount) {
                alert('CL-Felder dürfen nicht größer sein als Gesamtanzahl felder');
                return;
            }
            const clTeams = this.teams.filter(t => t.league === 'CL').map(t => t.name);
            const blTeams = this.teams.filter(t => t.league === 'BL').map(t => t.name);
            let clSchedule = this.makeRoundRobin(clTeams, this.returnLegs);
            let blSchedule = this.makeRoundRobin(blTeams, this.returnLegs);
            // assign fields
            clSchedule = this.assignFields(clSchedule, 'CL');
            blSchedule = this.assignFields(blSchedule, 'BL');
            this.schedule.CL = clSchedule;
            this.schedule.BL = blSchedule;
            // initialize results
            this.initResults('CL', clTeams);
            this.initResults('BL', blTeams);
            this.stopTimer();
        },
        makeRoundRobin(list, returnLegs = true) {
            // returns array of {round, home, away}
            const teams = [...list];
            if (teams.length === 0) return [];
            const bye = teams.length % 2 === 1;
            if (bye) teams.push('--- Freilos ---');
            const n = teams.length;
            const rounds = n - 1;
            const half = n / 2;
            const schedule = [];
            const arr = teams.slice();
            for (let round = 1; round <= rounds; round++) {
                for (let i = 0; i < half; i++) {
                    const t1 = arr[i];
                    const t2 = arr[n - 1 - i];
                    if (t1 !== '--- Freilos ---' && t2 !== '--- Freilos ---') {
                        schedule.push({ round, home: t1, away: t2 });
                    } else {
                        // bye match: still record, maybe with one side blank
                        schedule.push({ round, home: t1 === '--- Freilos ---' ? '' : t1, away: t2 === '--- Freilos ---' ? '' : t2 });
                    }
                }
                // rotate
                arr.splice(1, 0, arr.pop());
            }
            if (!returnLegs) {
                return schedule;
            }
            // create return matches; second half for return legs
            const full = [];
            schedule.forEach(m => full.push(m));
            schedule.forEach(m => {
                if (m.home && m.away) {
                    full.push({ round: m.round + rounds, home: m.away, away: m.home });
                } else {
                    full.push({ round: m.round + rounds, home: m.away, away: m.home });
                }
            });
            return full;
        },
        assignFields(schedule, league) {
            // attach field number or waiting status to each match
            if (!schedule.length) return [];
            const byRound = {};
            schedule.forEach(match => {
                if (!byRound[match.round]) byRound[match.round] = [];
                byRound[match.round].push(match);
            });
            const result = [];
            const leagueFields = league === 'CL' ? this.clFieldCount : (this.fieldCount - this.clFieldCount);
            Object.keys(byRound).sort((a,b)=>a-b).forEach(r => {
                const matches = byRound[r];
                // prioritize real matches (both teams present) to get fields
                const realMatches = matches.filter(m => m.home && m.away);
                const pauseMatches = matches.filter(m => !(m.home && m.away));
                realMatches.forEach((m, idx) => {
                    const fieldIndex = idx + 1; // 1-based within league
                    if (fieldIndex <= leagueFields) {
                        const actual = league === 'CL' ? fieldIndex : (this.clFieldCount + fieldIndex);
                        result.push({ ...m, field: actual });
                    } else {
                        // not enough fields; match waits
                        result.push({ ...m, field: null });
                    }
                });
                // pause matches do not consume fields
                pauseMatches.forEach(m => {
                    result.push({ ...m, field: null });
                });
            });
            return result;
        },
        downloadSchedule() {
            const data = {
                fields: this.fieldCount,
                clFields: this.clFieldCount,
                teams: this.teams,
                schedule: this.schedule,
                results: this.results
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'spielfest-plan.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
        downloadCSV() {
            const rows = [];
            const quote = v => '"' + String(v).replace(/"/g, '""') + '"';

            const pushSection = (title) => {
                rows.push([title]);
                rows.push([]);
            };

            const pushTable = (header, data) => {
                rows.push(header);
                data.forEach(r => rows.push(r));
                rows.push([]);
            };

            // Spielplan CL
            pushSection('Spielplan CL');
            pushTable(['Runde', 'Heim', 'Gast', 'Feld'],
                this.schedule.CL.map(g => [g.round, g.home || '', g.away || '', g.field !== null ? g.field : '']));

            // Spielplan BL
            pushSection('Spielplan BL');
            pushTable(['Runde', 'Heim', 'Gast', 'Feld'],
                this.schedule.BL.map(g => [g.round, g.home || '', g.away || '', g.field !== null ? g.field : '']));

            // Tabellen CL
            const maxCL = this.maxRoundCL;
            if (maxCL > 0) {
                pushSection('Tabelle CL');
                const headerCL = ['Team'];
                for (let r = 1; r <= maxCL; r++) headerCL.push('R' + r);
                headerCL.push('Total');
                const dataCL = this.standingsCL.map(row => {
                    return [row.team, ...row.rounds.map(v => v ?? ''), row.total];
                });
                pushTable(headerCL, dataCL);
            }

            // Tabellen BL
            const maxBL = this.maxRoundBL;
            if (maxBL > 0) {
                pushSection('Tabelle BL');
                const headerBL = ['Team'];
                for (let r = 1; r <= maxBL; r++) headerBL.push('R' + r);
                headerBL.push('Total');
                const dataBL = this.standingsBL.map(row => {
                    return [row.team, ...row.rounds.map(v => v ?? ''), row.total];
                });
                pushTable(headerBL, dataBL);
            }

            const csv = rows.map(r => r.map(quote).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'spielfest-plan.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
        importSchedule(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.fieldCount = data.fields ?? this.fieldCount;
                    this.clFieldCount = data.clFields ?? this.clFieldCount;
                    this.teams = data.teams ?? this.teams;
                    this.schedule = data.schedule ?? this.schedule;
                    this.results = data.results ?? this.results;
                    this.currentRoundCL = 1;
                    this.currentRoundBL = 1;
                    alert('Spielfest importiert. Bitte Spielplan ggf. neu generieren.');
                } catch (err) {
                    alert('Import fehlgeschlagen: ungültige Datei');
                }
            };
            reader.readAsText(file);
            // clear file input so the same file can be re-selected
            event.target.value = null;
        },
        initResults(league, teamList) {
            const maxRound = league === 'CL'
                ? (this.schedule.CL.reduce((m, r) => Math.max(m, r.round), 0))
                : (this.schedule.BL.reduce((m, r) => Math.max(m, r.round), 0));
            this.results[league] = {};
            teamList.forEach(t => {
                this.results[league][t] = Array(maxRound).fill(null);
            });
            // reset current round
            if (league === 'CL') this.currentRoundCL = 1;
            else this.currentRoundBL = 1;
        },
        startTimer() {
            this.stopTimer();
            this.timeLeft = this.timerSeconds;
            this.showTimerAlert = false;
            this.timerId = setInterval(() => {
                if (this.timeLeft > 0) {
                    this.timeLeft -= 1;
                } else {
                    this.stopTimer();
                    this.showTimerAlert = true;
                    this.playEndSound();
                }
            }, 1000);
        },
        playEndSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 880;
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
                // close context after sound
                osc.onended = () => ctx.close();
            } catch (e) {
                // silently ignore if audio API not available
            }
        },
        saveState() {
            const data = {
                fieldCount: this.fieldCount,
                clFieldCount: this.clFieldCount,
                teams: this.teams,
                schedule: this.schedule,
                results: this.results,
                returnLegs: this.returnLegs,
                currentRoundCL: this.currentRoundCL,
                currentRoundBL: this.currentRoundBL,
                timerLength: this.timerLength,
                timerSize: this.timerSize,
                timerVisible: this.timerVisible
            };
            localStorage.setItem('spielfestState', JSON.stringify(data));
        },
        printSchedule() {
            window.print();
        },
        newSpielfest() {
            // export current state then clear everything
            this.downloadSchedule();
            localStorage.removeItem('spielfestState');
            this.fieldCount = 1;
            this.clFieldCount = 0;
            this.teams = [];
            this.schedule = {CL: [], BL: []};
            this.results = {CL: {}, BL: {}};
            this.currentRoundCL = 1;
            this.currentRoundBL = 1;
            this.timeLeft = 0;
            this.stopTimer();
            alert('Neues Spielfest gestartet – alte Daten wurden gesichert und zurückgesetzt.');
        },
        loadState() {
            const raw = localStorage.getItem('spielfestState');
            if (!raw) return;
            try {
                const data = JSON.parse(raw);
                this.fieldCount = data.fieldCount || this.fieldCount;
                this.clFieldCount = data.clFieldCount || this.clFieldCount;
                this.teams = data.teams || this.teams;
                this.schedule = data.schedule || this.schedule;
                this.results = data.results || this.results;
                this.returnLegs = typeof data.returnLegs === 'boolean' ? data.returnLegs : this.returnLegs;
                this.currentRoundCL = data.currentRoundCL || this.currentRoundCL;
                this.currentRoundBL = data.currentRoundBL || this.currentRoundBL;
                this.timerLength = data.timerLength || this.timerLength;
                this.timerSize = data.timerSize || this.timerSize;
                this.timerVisible = typeof data.timerVisible === 'boolean' ? data.timerVisible : this.timerVisible;
            } catch (e) {
                console.warn('Fehler beim Laden des Zustands', e);
            }
        },
        // existing methods follow...
        stopTimer() {
            if (this.timerId) {
                clearInterval(this.timerId);
                this.timerId = null;
            }
        },
        computeStandings(league) {
            const rows = [];
            const res = this.results[league] || {};
            Object.keys(res).forEach(team => {
                const rounds = res[team] || [];
                const total = rounds.reduce((s,v)=>s + (parseFloat(v)||0),0);
                rows.push({ team, rounds, total });
            });
            return rows.sort((a,b)=>b.total - a.total);
        },
        // round navigation helpers
        nextRound(league) {
            if (league==='CL' && this.currentRoundCL < this.maxRoundCL) this.currentRoundCL++;
            if (league==='BL' && this.currentRoundBL < this.maxRoundBL) this.currentRoundBL++;
        },
        prevRound(league) {
            if (league==='CL' && this.currentRoundCL > 1) this.currentRoundCL--;
            if (league==='BL' && this.currentRoundBL > 1) this.currentRoundBL--;
        }
    }
}).mount('#app');
