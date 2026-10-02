const severityDescriptions = [
    "0 - not an issue",
    "1 - might rarely cause issues",
    "2 - likely to cause issues; possibly grounds for rejection from SSSO",
    "3 - very likely to cause issues; grounds for rejection from SSSO"
];

let report = [null, null, null, null, null, null];

let diffTypeNames = [
    "unknown diff",
    "unknown diff",
    "Easy",
    "Normal",
    "Hard",
    "Expert",
    "XD",
    "RemiXD"
];

function convertToBinaryNotes(notes) {
    let ret = [];
    for(let i = 0; i < notes.length; i++) {
        ret.push({
            tk: Math.floor(notes[i].time * 100000),
            tp: notes[i].type,
            c: notes[i].colorIndex,
            p: notes[i].column,
            s: notes[i].m_size
        });
    }
    return ret;
}

function renderBasicDiagnostics() {
    let diagnosticsRoot = document.getElementById(`dv-root`);

    while(diagnosticsRoot.hasChildNodes()){
        diagnosticsRoot.removeChild(diagnosticsRoot.firstChild);
    }

    let enableMigrateButton = false;

    let trackInfo = getTrackInfo();
    let failed = false
    for(let i = 0; i < trackInfo.difficulties.length; i++) {
        if(trackInfo.difficulties[i]._active == true) {
            let key = trackInfo.difficulties[i].assetName;
            let trackData = getTrackDataByKey("", key);
            if(!trackData || !trackData.difficultyType && trackData.difficultyType != 0) continue;

            let mainContainer = document.createElement("div");
            mainContainer.setAttribute("class", "dv-box");
            mainContainer.setAttribute("id", `dv-diff${i}`)

            let diffType = trackData.difficultyType;
            if (diffType > 7) diffType = 0;

            let title = mainContainer.appendChild(document.createElement("div"));
            title.textContent = diffTypeNames[diffType];
            title.setAttribute("class", "dv-box-title");

            let encoding = trackData.noteSerializationFormat;
            let notes;
            let warning;
            switch(encoding) {
                case 0: //floating-point encoding
                    enableMigrateButton = true;
                    notes = trackData.notes;
                    notes = convertToBinaryNotes(notes);
                    
                    warning = mainContainer.appendChild(document.createElement("div"));
                    warning.textContent = "Old note format; score values are approximate!";
                    warning.setAttribute("class", "dv-warning");

                    break;
                case 2: //binary encoding w/ integer tick values
                    notes = trackData.binaryNotes;

                    break;
                default: //unknown or compressed (unused)
                    warning = mainContainer.appendChild(document.createElement("div"));
                    warning.textContent = "Unknown note encoding; skipping diagnostics!";
                    warning.setAttribute("class", "dv-warning");
            }

            calculateBalance(notes, mainContainer);
            calculateMaxScoreAndCombo(notes, mainContainer);

            let buttonElem = mainContainer.appendChild(document.createElement("button"));
            buttonElem.setAttribute("class", "button");
            buttonElem.setAttribute("onclick", `copyToClipboard(${i})`);
            buttonElem.setAttribute("title", `Copy a comma-separated summary to clipboard.`);
            buttonElem.textContent = "Copy Score Data";

            let mirrorTwistyButton = mainContainer.appendChild(document.createElement("button"));
            mirrorTwistyButton.setAttribute("class", "button");
            mirrorTwistyButton.setAttribute("onclick", `mirrorTwistyTrack(${i})`);
            mirrorTwistyButton.setAttribute("title", `Mirror all yaw and roll values in this difficulty.`);
            mirrorTwistyButton.textContent = "Mirror Twisty Track";

            try {
                report[i] = checkUnmissableNotes(notes);
                report[i].push(...checkForEndlessSliders(notes));
                let reportElem = createReportElement(report[i], diffTypeNames[i+2]);
                mainContainer.append(reportElem);
            }
            catch (e) {
                failed = true;
                console.error(e);
            }

            diagnosticsRoot.appendChild(mainContainer);
        }
    }
    if(failed)
        createToast("Diagnostics failed", "Check the console for details", "warning", 10000);
    let migrateButton = document.getElementById(`dv-set-serialization`);
    if(enableMigrateButton) migrateButton.classList.remove("disabled");
    else migrateButton.classList.add("disabled");
}

function handleImportDiffButtonPressed(diff) {
    diffInput.setAttribute("diffType", diff);
    diffInput.click();
}

function calculateBalance(notesIn, htmlParent) {
    if(!notesIn || notesIn.length < 1) return;
    let nRed = 0,
        nBlue = 0,
        nInvisRed = 0,
        nInvisBlue = 0;
    let nMatch = 0,
        nTap = 0,
        nSlider = 0,
        nSliderRelease = 0,
        nBeat = 0,
        nBeathold = 0,
        nBeatRelease = 0,
        nLeftSpin = 0,
        nRightSpin = 0,
        nScratch = 0;

    let beatRecent = false;
    for(let i = 0; i < notesIn.length; i++) {
        switch(notesIn[i].tp) {
            case 0:
            case 4:
            case 8:
                if(notesIn[i].c == 0) nBlue++;
                else if(notesIn[i].c == 1) nRed++;
                else if(notesIn[i].c % 2 == 0) nInvisBlue++;
                else nInvisRed++;
                break;
        }
        switch(notesIn[i].tp) {
            case 0:
                nMatch++;
                break;
            case 1:
                nBeat++;
                beatRecent = true;
                break;
            case 2:
                nRightSpin++;
                break;
            case 3:
                nLeftSpin++;
                break;
            case 4:
                nSlider++;

                let prevMSize;
                over = false;
                for(let j = i + 1; j < notesIn.length; j++) {
                    switch(notesIn[j].tp) {
                        case 5: //note end
                            prevMSize = notesIn[j].s;
                            break;
                        case 2:
                        case 3:
                        case 4:
                        case 12:
                            over = true;
                            break;
                    }
                    if(over) break;
                }
                if(prevMSize == 2) {
                    nSliderRelease++;
                }


                break;
            case 8:
                nTap++;
                break;
            case 11:
                //logic for beathold
                if(beatRecent) {
                    nBeathold++;
                    if(notesIn[i].s != 2) nBeatRelease++;
                    beatRecent = false;
                }
                else
                    ;//error beathold endpoint
                break;
            case 12:
                nScratch++;
                break;
        }
    }
    let colorString = "Note Colors (blue:red): " + nBlue + ":" + nRed;
    if(nInvisRed + nInvisBlue > 0) {
        colorString += " (invis: " + nInvisBlue + ":" + nInvisRed + ")";
    }

    let subtitle = htmlParent.appendChild(document.createElement("div"));
    subtitle.textContent = "Note Counts";
    subtitle.setAttribute("class", "dv-box-subtitle");

    let matchElement = htmlParent.appendChild(document.createElement("div"));
    matchElement.classList.add("dv-box-content");
    matchElement.textContent = `Matches: ${nMatch}`;
    matchElement.classList.add("dv-match-count");
    let tapElement = htmlParent.appendChild(document.createElement("div"));
    tapElement.classList.add("dv-box-content");
    tapElement.textContent = `Taps: ${nTap + nSlider}`;
    tapElement.classList.add("dv-tap-count");
    let beatElement = htmlParent.appendChild(document.createElement("div"));
    beatElement.classList.add("dv-box-content");
    beatElement.textContent = `Beats: ${nBeat}`;
    beatElement.classList.add("dv-beat-count");
    let holdElement = htmlParent.appendChild(document.createElement("div"));
    holdElement.classList.add("dv-box-content");
    holdElement.textContent = `Holds: ${nSlider + nBeathold}`;
    holdElement.classList.add("dv-hold-count");
    let releaseElement = htmlParent.appendChild(document.createElement("div"));
    releaseElement.classList.add("dv-box-content");
    releaseElement.textContent = `Releases: ${nBeatRelease + nSliderRelease}`;
    releaseElement.classList.add("dv-release-count");
    let spinElement = htmlParent.appendChild(document.createElement("div"));
    spinElement.classList.add("dv-box-content");
    spinElement.textContent = `Spins: ${nLeftSpin + nRightSpin}`;
    spinElement.classList.add("dv-spin-count");
    let scratchElement = htmlParent.appendChild(document.createElement("div"));
    scratchElement.classList.add("dv-box-content");
    scratchElement.textContent = `Scratches: ${nScratch}`;
    scratchElement.classList.add("dv-scratch-count");
}

function calculateMaxScoreAndCombo (notesIn, htmlParent) {
    if(!notesIn || notesIn.length < 1) return;
    let maxScore = 0n;
    let tickDuration, addScore;
    let maxCombo = 0;
    for(let i = 0; i < notesIn.length; i++) {
        let bookmark, over, skip;
        switch(notesIn[i].tp) {
            case 0: //match
                maxScore += 16n;
                maxCombo ++;
                break;
            case 1: //beat
            case 8: //tap
                maxScore += 64n;
                maxCombo ++;
                break;
            case 4: //slider
                let prevMSize;
                maxScore += 64n;
                maxCombo ++;
                bookmark = notesIn[i].tk;
                over = false;
                for(let j = i + 1; j < notesIn.length; j++) {
                    switch(notesIn[j].tp) {
                        case 5: //note end
                            bookmark = notesIn[j].tk;
                            prevMSize = notesIn[j].s;
                            break;
                        case 2:
                        case 3:
                        case 4:
                        case 12:
                            over = true;
                            break;
                    }
                    if(over) break;
                }
                tickDuration = BigInt(bookmark)
                        - BigInt(notesIn[i].tk);
                addScore = tickDuration / 5000n;
                if(addScore < 1n) {
                    addScore = 1n;
                }
                maxScore += addScore * 4n;
                if(prevMSize == 2) {
                    maxScore += 48n;
                    maxCombo ++;
                }
                break;
            case 2: //right spin
            case 3: //left spin
            case 12: //scratch
                maxScore += 48n;
                maxCombo ++;
                bookmark = notesIn[i].tk;
                over = false;
                for(let j = i + 1; j < notesIn.length; j++) {
                    switch(notesIn[j].tp) {
                        case 0:
                        case 2:
                        case 3:
                        case 4:
                        case 5:
                        case 8:
                        case 12:
                            bookmark = notesIn[j].tk;
                            over = true;
                            break;
                    }
                    if(over) {
                        break;
                    }
                }
                if(!over) { //this spin/scratch goes the default length of 1 second
                    //todo: may break if the chart ends before this 1s has passed
                    maxScore += 80n;
                    break;
                }
                tickDuration = BigInt(bookmark) - BigInt(notesIn[i].tk);
                addScore = tickDuration / 5000n;
                if(addScore < 1n) {
                    addScore = 1n;
                }
                maxScore += addScore * 4n;
                break;
            case 5: //note endpoint
                break;
            case 11: //beathold
                bookmark = notesIn[i].tk;
                over = false;
                for(let j = i - 1; j >= 0; j--) {
                    switch(notesIn[j].tp) {
                        case 1:
                            bookmark = notesIn[j].tk;
                            over = true;
                            break;
                        case 11:
                            skip = true;
                            over = true;
                            break;
                    }
                    if(over) break;
                }
                
                if(!over || skip) {
                    // console.log("erronous beathold end at " + notesIn[i].tk / 100000);
                    break;
                }

                tickDuration = BigInt(notesIn[i].tk)
                        - BigInt(bookmark);
                addScore = tickDuration / 5000n;
                if(addScore < 1n) {
                    addScore = 1n;
                }
                maxScore += addScore * 4n;
                if(notesIn[i].s ==  1 || notesIn[i].s == 0) {
                    maxScore += 48n;
                    maxCombo ++;
                }
                break;
                
            default:
                console.log("found an unknown note type");
        }
    }
    let subtitle = htmlParent.appendChild(document.createElement("div"));
    subtitle.textContent = `Misc.`;
    subtitle.setAttribute("class", "dv-box-subtitle");

    let scoreElement = htmlParent.appendChild(document.createElement("div"));
    scoreElement.classList.add("dv-box-content");
    scoreElement.textContent = `Max score: ${maxScore}`;
    scoreElement.classList.add("dv-max-score");
    let comboElement = htmlParent.appendChild(document.createElement("div"));
    comboElement.classList.add("dv-box-content");
    comboElement.textContent = `Max combo: ${maxCombo}`;
    comboElement.classList.add("dv-max-combo");
}

function createReportElement (report, diffName) {
    let topSeverity = 0;
    let nIssue = 0;
    for(let i in report) {
        if(report[i].severity > topSeverity)
            topSeverity = report[i].severity;
        if(report[i].severity > 0)
            nIssue++;
    }

    let cont = document.createElement("div");
    cont.classList.add("dv-report");
    let label = document.createElement("label");

    let icon = document.createElement("span");
    if(report.length == 0) {
        icon.classList.add("icon-check");
        icon.innerText = '✓';
    }
    else {
        if(topSeverity == 0) icon.classList.add("icon-comment");
        if(topSeverity == 1) icon.classList.add("icon-warn");
        if(topSeverity == 2) icon.classList.add("icon-warn2");
        if(topSeverity == 3) icon.classList.add("icon-alert");
        icon.innerText = '!';
    }

    let button = document.createElement("button");
    button.classList.add("button");
    button.innerText = "View";
    button.addEventListener("click", (e) => {
        popupDiagnosticReport(report, diffName);
    });
    if(report.length == 0) {
        label.innerText = `no issues`;
        button.setAttribute("disabled", true);
        button.classList.add("disabled");
    }
    else if(nIssue == 0)
        label.innerText = `${report.length} comment${report.length != 1?'s':''}`;
    else
        label.innerText = `${nIssue} issue${nIssue != 1?'s':''}`;

    cont.appendChild(icon);
    cont.appendChild(label);
    cont.appendChild(button);
    return cont;
}