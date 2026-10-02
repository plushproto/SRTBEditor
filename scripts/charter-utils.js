function stackNearbyNotesAllDiffs() {
    let trackData = getReferences(chartJSON)[1];
    let numChanges = 0;
    let numDiffs = 0;

    for(let i = 0; i < trackInfo.difficulties.length; i++) {
        if(trackInfo.difficulties[i]._active) {
            let val;
            switch(trackData[i].noteSerializationFormat) {
                case 0:
                    val = stackNearbyNotes(trackData[i].notes, 0);
                    break;
                case 2:
                    val = stackNearbyNotes(trackData[i].binaryNotes, 2);
                    break;
                default:
                    createToast("Stack", "Aborting stack: note encoding format is unsupported", "warning", 5000);
                    return;
            }
            if(val) numDiffs++;
            numChanges += val;
        }
    }
    if(numChanges) {
        createToast("Stack", `Moved ${numChanges} note${numChanges>1?"s":""} across ${numDiffs} difficult${numDiffs>1?"ies":"y"}`, "success", 5000);
    }
    else {
        createToast("Stack", "Didn't find any notes to stack", "info", 5000);
    }
    updateChartData();
    discardEditorChanges();
}

function stackNearbyNotes(noteData, encoding) {
    let getCat = (val) => {
        // Categories:
        // 0: matches
        // 1: taps, sliders
        // 2: slider endpoints
        // 3: spins, scratches
        // 4: beats, beatholds
        switch(val) {
            case 0: return 0;
            case 8:
            case 4: return 1;
            case 5: return 2;
            case 2:
            case 3:
            case 12: return 3;
            case 1:
            case 11: return 4;
            default:
                console.warn("Unrecognized note type: " + val);
                return -1;
        }
        
    };
    let prevTime = -1;
    let prevCat = -1;
    let numChanges = 0;
    for(let i = 0; i < noteData.length; i++) {
        if(encoding == 0) {
            if(noteData[i].time < prevTime) {
                console.warn("Notes are out of order, aborting stack operation");
                createToast("Stack", "Aborting stack: notes are out of order. Please save in-game and try again.", "warning", 5000);
                return;
            }

            let curCat = getCat(noteData[i].type);

            if(noteData[i].time - prevTime < 0.0005         // stack if notes are within 5ms, except:
                    && noteData[i].time !== prevTime        // no if they're already stacked
                    && !(curCat == 2)                       // no slider endpoints 
                    && !(curCat == 3 && prevCat !== 4)      // no spins to non-beats
                    && !(curCat !== 4 && prevCat == 3)      // no non-beats to spins
                    && !(curCat == 4 && prevCat == 4)) {    // no beats to beats
                noteData[i].time = prevTime;
                numChanges++;
            }
            else prevTime = noteData[i].time;
            prevCat = curCat;
        }
        else if (encoding == 2) {
            if(noteData[i].tk < prevTime) {
                console.warn("Notes are out of order, aborting stack operation");
                createToast("Stack", "Aborting stack: notes are out of order. Please save in-game and try again.", "warning", 5000);
                return;
            }

            let curCat = getCat(noteData[i].tp);
            
            if(noteData[i].tk - prevTime < 50               // stack if notes are within 50 ticks, except:
                    && noteData[i].tk !== prevTime          // no if they're already stacked
                    && !(curCat == 2)                       // no slider endpoints
                    && !(curCat == 3 && prevCat !== 4)      // no spins to non-beats
                    && !(curCat !== 4 && prevCat == 3)      // no non-beats to spins
                    && !(curCat == 4 && prevCat == 4)) {    // no beats to beats
                noteData[i].tk = prevTime;
                numChanges++;
            }
            else prevTime = noteData[i].tk;
            prevCat = curCat;
        }
    }
    return numChanges;
}

function mirrorTwistyTrack(index) {
    let trackData = getReferences(chartJSON)[1];
    let trackTurns = trackData[index].references.RefIds[0].data.trackTurns;
    if(trackTurns && trackTurns.length) {
        for(let i = 0; i < trackTurns.length; i++) {
            trackTurns[i].turnAmount.y *= -1;
            trackTurns[i].turnAmount.z *= -1;
        }
        updateChartData();
        discardEditorChanges();
        createToast("Mirror", `Mirrored ${trackTurns.length} flight path${trackTurns.length>1?"s":""}`, "success", 5000);
    }
    else
        createToast("Mirror", "No flight paths found.", "info", 5000);
}

function copyToClipboard(index) {
    let ret = "";
    let elem = document.getElementById(`dv-diff${index}`);
    if(elem && elem.querySelector(".dv-max-score")) {
        ret += trackInfo.title + '\t';
        let line = elem.querySelector(".dv-max-score").textContent;
        ret += line.substring(line.lastIndexOf(':') + 1).trim() + '\t';
        line = elem.querySelector(".dv-max-combo").textContent
        ret += line.substring(line.lastIndexOf(':') + 1).trim() + '\t';
        navigator.clipboard.writeText(ret);
        createToast("Copy", "Score data copied to clipboard.", "success", 5000);
    }
    else 
        createToast("Copy", "No score data to copy.", "info", 5000);
}

function replaceChartLyrics(lyricJson) {
    if(!lyricJson) return;

    let lyrics = fetchLyricsFromJson(lyricJson);

    let clipInfo = getReferences(chartJSON)[2][0];
    clipInfo.lyrics = lyrics;
    updateChartData();
    discardEditorChanges();
    createToast("Lyrics", "Successfully imported lyrics.", "success", 5000);
}

function replaceChartDifficulty(newJson, args) {
    let diff = args[0];
    if(!diff || diff < 0 || diff > 5) {
        console.error(`attempted to replace an invalid difficulty ${diff}`);
        return;
    }
    let newTrackData = fetchTrackDataByDifficulty(newJson, diff);
    replaceTrackDataByDifficulty(newTrackData, diff);
    console.warn("using old method, pls fix");
}

function changeNoteEncodings(format) {
    popupConfirmModernizeFormat().then((result) => {
        if(!result) return;
        let diffs = getReferences(chartJSON)[1];
        for(let i = 0; i < diffs.length; i++) {
            if(format != 2) {
                console.warn("Only changing to format 2 is supported at this time");
            }
            if(format == 2) {
                for(let j = 0; j < diffs[i].notes.length; j++) {
                    let note = diffs[i].notes[j];
                    diffs[i].binaryNotes.push({
                        "tk": Math.round(note.time * 100000),
                        "tp": note.type,
                        "c": note.colorIndex,
                        "p": note.column,
                        "s": note.m_size
                    });
                }
                diffs[i].noteSerializationFormat = format;
                diffs[i].notes = [];
            }
        }
        updateChartData();
        discardEditorChanges();
        createToast("Format", "Note format successfully changed.", "success", 5000);
    });
}

function mergeChart(newFile) {
    passJsonToCallback(newFile, mergeChartJson);
}

function mergeChartJson(newJson) {
    let newTrackData = getTrackInfo(newJson);
    popupMergeChart(newTrackData.title, newTrackData.subtitle, newJson).then((ret) => {
        if(ret != 1) return;
        let elem;
        let rep = false;
        let numActions = 0;

        //primary metadata
        elem = document.getElementById("merge-0");
        if(elem && elem.checked) {
            numActions++;

            let oldInfo = getTrackInfo();
            let newInfo = getTrackInfo(newJson);

            if(!oldInfo || !newInfo)
                console.warn("failed to find TrackInfo");

            //snapshot diffs and art references, load new trackData, reload snapshots
            let diffs = oldInfo.difficulties;
            let art = oldInfo.albumArtReference;
            oldInfo = JSON.parse(JSON.stringify(newInfo));
            oldInfo.difficulties = diffs;
            oldInfo.albumArtReference = art;

            loadChartData(setTrackInfo("", oldInfo));
        }
        else {
            //backgrounds
            elem = document.getElementById("merge-0-0");
            if(elem && elem.checked) {
                numActions++;
                let oldInfo = getTrackInfo();
                let newInfo = getTrackInfo(newJson);

                //todo: check for old background formats too
                oldInfo.backgroundId = newInfo.backgroundId;
                oldInfo.backgroundColoring = newInfo.backgroundColoring;
                oldInfo.fallbackBackgroundId = newInfo.fallbackBackgroundId;
                oldInfo.fallbackColoringBackgroundId = newInfo.fallbackColoringBackgroundId;
                oldInfo.objectReplacements = newInfo.objectReplacements;
                
                loadChartData(setTrackInfo("", oldInfo));
            }
        }

        //for each diff
        for(let i = 1; i < 7; i++) {
            elem = document.getElementById(`merge-${i}`);
            if(elem) {
                let oldDiff = getTrackDataByDiff("", i-1);
                let newDiff = getTrackDataByDiff(newJson, i-1);

                //if new chart doesn't have this diff, skip it
                if(!newDiff) continue;

                if(elem.checked) {
                    numActions++;
                    //if old chart doesn't have this diff, create it
                    if(!oldDiff) {
                        loadChartData(generateTrackData("", i-1));
                        oldDiff = getTrackDataByDiff("", i-1);
                        console.warn("generating a diff first!");
                    }

                    //the entire diff
                    oldDiff = newDiff;
                    rep = true;

                    //enable/disable according to the imported diff
                    let oldInd = getTrackDataIndexByDiff("", i-1);
                    let newInd = getTrackDataIndexByDiff(newJson, i-1);
                    if(oldInd == -1 || newInd == -1) {
                        console.warn("failed to find diff entry in TrackInfo");
                    }
                    else {
                        let oldKey = chartJSON.largeStringValuesContainer.values[oldInd].key;
                        let newKey = newJson.largeStringValuesContainer.values[newInd].key;
                        let active = getDiffActiveByKey(newJson, newKey);

                        loadChartData(setDiffActiveByKey("", oldKey, active));
                    }
                }
                else {

                    elem = document.getElementById(`merge-${i}-0`);
                    if(elem && elem.checked) {
                        numActions++;
                        //if old chart doesn't have this diff, create it
                        if(!oldDiff) {
                            loadChartData(generateTrackData("", i-1));
                            oldDiff = getTrackDataByDiff("", i-1);
                            console.warn("generating a diff first! (why are you partially merging into a diff that didn't exist?)");
                        }
                        //clip data
                        oldDiff.clipInfoAssetReferences = newDiff.clipInfoAssetReferences;
                        oldDiff.clipData = newDiff.clipData;
                        rep = true;
                    }

                    elem = document.getElementById(`merge-${i}-1`);
                    if(elem && elem.checked) {
                        numActions++;
                        //if old chart doesn't have this diff, create it
                        if(!oldDiff) {
                            loadChartData(generateTrackData("", i-1));
                            oldDiff = getTrackDataByDiff("", i-1);
                            console.warn("generating a diff first! (why are you partially merging into a diff that didn't exist?)");
                        }
                        //notes
                        oldDiff.noteSerializationFormat = newDiff.noteSerializationFormat;
                        oldDiff.notes = newDiff.notes;
                        oldDiff.notesCompressed = newDiff.notesCompressed;
                        oldDiff.binaryNotes = newDiff.binaryNotes;
                        rep = true;
                    }
                    elem = document.getElementById(`merge-${i}-2`);
                    if(elem && elem.checked) {
                        //extra check: skip twisty track if it doesn't exist in new chart
                        if(newDiff.references && newDiff.splinePath) {
                            numActions++;
                            //if old chart doesn't have this diff, create it
                            if(!oldDiff) {
                                loadChartData(generateTrackData("", i-1));
                                oldDiff = getTrackDataByDiff("", i-1);
                                console.warn("generating a diff first! (why are you partially merging into a diff that didn't exist?)");
                            }
                            //track turns
                            if(!oldDiff.references) oldDiff.references = {};
                            oldDiff.splinePath = newDiff.splinePath;
                            oldDiff.splinePathData = newDiff.splinePathData;
                            oldDiff.references.RefIds = newDiff.references.RefIds;
                            console.log(newDiff.references.RefIds);
                            rep = true;
                        }
                        else {
                            console.warn("skipped track turn import: track turn fields don't exist");
                        }
                    }
                }
                if(rep) {
                    loadChartData(setTrackDataByDiff(oldDiff, i-1));
                    rep = false;
                }
            }
        }
        
        //clip info
        elem = document.getElementById("merge-7");
        if(elem) {

            let oldClip = getLargeStringByKey("", "SO_ClipInfo_ClipInfo_0");
            let newClip = getLargeStringByKey(newJson, "SO_ClipInfo_ClipInfo_0");

            if(!oldClip || !newClip)
                console.warn("failed to find ClipInfo");

            if(elem.checked) {
                numActions++;
                //the entire clip info
                if(oldClip.clipAssetReference.assetName != newClip.clipAssetReference.assetName) {
                    //todo: process merge zip audio if it exists
                    if(document.getElementById("bv-audio-clips").value)
                        createToast("Clip Info Merge",
                            "The audio asset reference changed in the merge. Double check your audio before uploading",
                            "warning", 10000);
                }

                oldClip = newClip;
                rep = true;
            }
            else {
                elem = document.getElementById("merge-7-0");
                if(elem && elem.checked) {
                    numActions++;
                    //tempomap
                    oldClip.timeSignatureMarkers = newClip.timeSignatureMarkers;
                    oldClip.bpmMarkers = newClip.bpmMarkers;
                    rep = true;
                }

                elem = document.getElementById("merge-7-1");
                if(elem && elem.checked) {
                    numActions++;
                    //cuepoints
                    oldClip.cuePoints = newClip.cuePoints;
                    rep = true;
                }
                elem = document.getElementById("merge-7-2");
                if(elem && elem.checked) {
                    numActions++;
                    //lyrics
                    oldClip.lyrics = newClip.lyrics;
                    rep = true;
                }
            }
            if(rep) {
                setLargeStringByKey(oldClip, "SO_ClipInfo_ClipInfo_0");
                rep = false;
            }
        }
        if(numActions)
            createToast("Import successful", `Completed ${numActions} operation${numActions!=1?"s":""}`, "success", 5000);
        else
            createToast("Import skipped", "Found nothing to import", "info", 5000);
    });
}

function getPotentialPlayerPosition (notes, checkIndex) {

    // check if a slider occurs here (sliders always take priority)
    let prevSlider, nextSlider;
    let prevIndex, nextIndex;
    for(let i = checkIndex - 1; i >= 0; i--) {
        if([2, 3, 12].includes(notes[i].tp))
            break;

        if([4, 5].includes(notes[i].tp) && !prevIndex)
            prevIndex = i;

        if(notes[i].tp == 4) {
            prevSlider = true;
            break;
        }
    }
    if(prevSlider) {
        for(let i = checkIndex + 1; i < notes.length; i++) {
            if([2, 3, 4, 12].includes(notes[i].tp)) {
                break;
            }
            if(notes[i].tp == 5) {
                nextSlider = true;
                nextIndex = i;
                break;
            }
        }
    }
    if(nextSlider) {
        //if prev and next are close, we can be anywhere between them
        if(nextIndex.tk - notes[prevIndex].tk < 10000) {
            return {
                lane: modulo((getAdjustedLane(notes, nextIndex) + getAdjustedLane(notes, prevIndex)), 8) / 2,
                spread: Math.abs(nextIndex.p - notes[prevIndex].p)
            };
        }
        //if prev and next aren't close, math out the slider shape
        let timeDiff = notes[nextIndex].tk - notes[prevIndex].tk;
        let progress = (notes[checkIndex].tk - notes[prevIndex].tk) / timeDiff;
        let gap = notes[nextIndex].p - notes[prevIndex].p;
        let pos, spread = timeDiff > 20000 ? 1 : 2;

        // featuring disgusting approximations of slider shapes!
        switch(notes[prevIndex].s) {
            case 0:
            case 1:
            default: //cosine
                pos = -1 * (Math.cos(progress * Math.PI / 2) - 1) * gap;
                break;
            case 2: //curve-late
                pos = Math.pow(progress, 2.4) * gap;
                break;
            case 3: //curve-early
                pos = Math.pow(progress, 1 / 2.4) * gap;
                break;
            case 4: //linear
                pos = progress * gap;
                break;
            case 5: //90
                if(notes[nextIndex].tk - notes[checkIndex].tk > 1200) {
                    pos = 0;
                    spread = 1
                }
                else {
                    pos = gap / 2;
                    spread = gap / 2 + 1
                }
        }
        return {
            lane: modulo(getAdjustedLane(notes, prevIndex) + pos, 8),
            spread: spread
        }
    }

    // not a slider, we'll use the prev and next notes instead
    else {
        prevIndex = undefined;
        // find the prev note
        for(let i = checkIndex - 1; i >= 0; i--) {
            // return if previous defining note was a spin or scratch
            if([2, 3, 12].includes(notes[i].tp))
                return {
                    lane: "aPoint"
                }

            // return immediately if there's a tap in this stack
            if([4, 8].includes(notes[i].tp) && notes[i].tk - notes[checkIndex].tk > -1000)
                return {
                    lane: getAdjustedLane(notes, i),
                    spread: 1
                };
            
            
            // accept taps, slider midpoints, and visible matches (if they're not in this stack)
            if((notes[i].tp == 5 && isEndpointSlider(notes, i) //prev was a slider endpoint
                    || [4, 8].includes(notes[i].tp) //prev was a tap/slider
                    || (notes[i].tp == 0 && notes[i].c < 2 && notes[i].p < 5 && notes[i].p > -5)) //prev was a visible match
                    && notes[i].tk - notes[checkIndex].tk < -1000) { //not in this stack
                prevIndex = i;
                break;
            }
        }

        // find the next note
        for(let i = checkIndex + 1; i < notes.length; i++) {
            // accept spins and scratches
            if([2, 3, 12].includes(notes[i].tp)) {
                nextIndex = i;
                break;
            }

            // return immediately if there's a stacked tap
            if([4, 8].includes(notes[i].tp) && notes[i].tk - notes[checkIndex].tk < 1000)
                return {
                    lane: getAdjustedLane(notes, i),
                    spread: 1
                };

            // accept taps and visible matches (if they're not in this stack)
            if(([4, 8].includes(notes[i].tp)
                    || (notes[i].tp == 0 && notes[i].c < 2 && notes[i].p < 5 && notes[i].p > -5))
                    && notes[i].tk - notes[checkIndex].tk > 1000) { //not in this stack
                nextIndex = i;
                break;
            }
        }



        //if no previous note, we're at the chart start alignment point
        if(!prevIndex) {
            return {
                lane: fetchAlignmentPoint(notes, checkIndex),
                spread: 0
            };
        }

        //if next note is a spin/scratch or there is no next note, we're holding still
        else if(!nextIndex || [2, 3, 12].includes(notes[nextIndex].tp)) {
            //if prev position came after a spin, we're still there
            //TODO: check for this
            //else, we could be 1 lane off in either direction
            return {
                lane: modulo(getAdjustedLane(notes, prevIndex), 8),
                spread: 1
            };
        }

        //no other conditions met, we just gotta math it out
        else {
            // no movement (color swap or not)
            if(modulo(getAdjustedLane(notes, prevIndex), 8) == getAdjustedLane(notes, nextIndex)) {
                //if we haven't moved since the aPoint, spread 0: otherwise, spread 1
                let moved = false;
                let aPoint = fetchAlignmentPoint(notes, checkIndex);
                for(let k = checkIndex; k >= 0; k--) {
                    if(([4, 8].includes(notes[k].tp)
                            || (notes[k].tp == 0 && notes[k].c < 2))
                            && Math.abs(getAdjustedLane(notes, k) - aPoint) >= 2) {
                        moved = true;
                        break;
                    }
                    if([2, 3].includes(notes[k].tp))
                        break;
                }
                return {
                    lane: modulo(getAdjustedLane(notes, prevIndex), 8),
                    spread: moved ? 1 : 0
                }
            }

            // movement and color swap
            if(notes[prevIndex].c % 2 != notes[nextIndex].c % 2) {
                return {
                    lane: 0,
                    spread: 4
                }
            }

            // movement and no color swap
            let movement = notes[nextIndex].p - notes[prevIndex].p;
            return {
                lane: modulo(getAdjustedLane(notes, prevIndex) + movement / 2, 8),
                spread: Math.abs(movement) / 2 + 0.5
            }
        }
    }
}

function getPotentialPlayerDrift (notes, checkIndex) {
    let alignIndex = -1;
    // find the alignmentPoint's note index
    for(let i = checkIndex - 1; i >= 0; i--) {
        if([0, 4, 8].includes(notes[i].tp)) alignIndex = i;
        if([2, 3].includes(notes[i].tp)) break;
    }

    // if no positional notes, no drift
    if(alignIndex == -1) return {
        drift: 0,
        leftAmbiguity: 0,
        rightAmbiguity: 0
    };

    let curNote = notes[alignIndex];
    let drift = 0, leftA = 0, rightA = 0;
    for(let i = alignIndex + 1; i < checkIndex; i++) {
        //skip irrelevant notes
        if([0, 11].includes(notes[i])) continue;
        if(notes[i].tp == 0 && !isVisibleAndOntrack(notes[i], 7)) continue;

        //this note should be aligned to
        if([0, 4, 8].includes(notes[i].tp)) {

            // no color swap
            let curColor = curNote.c % 2;
            if(curNote.tp == 5) curColor = getSliderColor(curNote);
            if(notes[i].c % 2 == curColor) {
                drift += notes[i].p - curNote.p;
            }

            // color swap
            else {
                let distance = (notes[i].p - curNote.p) % 8;
                // if opposite lane swap, no drift
                if(Math.abs(distance) == 4);

                // if uneven swap, move the shorter way
                else if(curNote.p != notes[i].p) {

                    //sanity check: if distance is in (0, 4), we move right (negative drift)
                    // if distance is in (4, 8), we move left (positive)
                    if(distance > 4) distance = 4 - distance;
                    if(distance < -4) distance = -4 - distance;
                    drift -= distance;

                    // if this isn't an opposite-lane swap, add to ambiguity
                    if(Math.abs(distance) > 1) {
                        if(distance < 0) rightA += 8 - Math.abs(distance);
                        else leftA += 8 - Math.abs(distance);
                    }
                }
                // else, swap outward
                else {
                    //if on the right, swap rightward
                    if(curNote.p > 0) {
                        drift -= 4;
                        leftA += 8;
                    }
                    //else, swap leftward
                    else {
                        drift += 4;
                        rightA += 8;

                    }
                }
            }
            curNote = notes[i];
        }

        // this is a slider, and it should be followed until it ends or we meet the checkIndex
        let errorSlider = false;
        if(notes[i].tp == 4) {
            //jump to the end of this slider, compare startPos (absolute) to endPos (absolute)
            let endIndex;
            for(let j = i + 1; j < notes.length; j++) {
                if(j >= checkIndex) {
                    break;
                }
                if(notes[j].tp == 5) endIndex = j;
                if([2, 3, 4, 12].includes(notes[j].tp)) break;
            }
            if(!endIndex) errorSlider = true;
            else {
                drift += notes[endIndex].p - curNote.p;
                curNote = notes[endIndex];
                i = endIndex;
            }
        }
    }
    return {
        drift: drift,
        leftAmbiguity: leftA,
        rightAmbiguity: rightA
    };
}

function isEndpointSlider (notes, startIndex) {
    for(let i = startIndex - 1; i >=0; i--) {
        switch(notes[i].tp) {
            case 2:
            case 3:
            case 12:
                return false;
            case 4:
                return true;
        }
    }
    return false;
}

function isEndpointRelease (notes, startIndex) {
    if(notes[startIndex].s != 1) return false;
    for(let i = startIndex + 1; i < notes.length; i++) {
        switch(notes[i].tp) {
            case 5:
                return false;
            case 2:
            case 3:
            case 4:
            case 12:
                return true;
        }
    }
    return true;

}

function indsToNotes (notes, indices) {
    let ret = [];
    for(let i in indices) {
        ret.push(notes[indices[i]]);
    }
    return ret;
}

function getSliderColor (notes, startIndex) {
    for(let i = startIndex - 1; i >=0; i--) {
        switch(notes[i].tp) {
            case 2:
            case 3:
            case 12:
                return -1;
            case 4:
                return notes[i].c;
        }
    }
    return -1;
}

function getNumMatchesInStack(stack) {
    let num = 0;
    for(let i in stack) {
        if(stack[i].tp == 0)
            num++;
    }
    return num;
}

function getLargestGapInStack (stack) {
    let lanes = [0, 0, 0, 0, 0, 0, 0, 0]
    for(let k = 0; k < stack.length; k++) {
        if(stack[k].tp == 5) return 0; // stack auto-hits with slider endpoint
        else {
            let color = stack[k].c % 2;
            let lane = modulo(stack[k].p + color * 4, 8);
            lanes[lane]++;
        }
    }
    let cur = 0, longest = 0;
    for(k in lanes) {
        if(lanes[k] == 0) cur++;
        else {
            if(cur > longest)
                longest = cur;
            cur = 0;
        }
    }
    for(k in lanes) {
        if(lanes[k] == 0) cur++;
        else {
            if(cur > longest) longest = cur;
            break;
        }
    }
    return longest;
}

function getStackHasInvis (stack) {
    for(let i in stack) {
        if(!isVisible(stack[i]))
            return true;
    }
    return false;
}

function getStackHasOfftrack (stack) {
    for(let i in stack) {
        if(!isOntrack(stack[i]))
            return true;
    }
    return false;
}

function getStackHasInvisOrOfftrack (stack) {
    for(let i in stack) {
        if(!isVisibleAndOntrack(stack[i]))
            return true;
    }
    return false;
}

function getStackHasVis (stack) {
    for(let i in stack) {
        if([0, 4, 8].includes(stack[i].tp) && stack[i].c < 2 &&
                stack[i].p < 5 && stack[i].p > -5)
            return true;
    }
    return false;
}

function getStackHasVisMatch (stack ) {
    for(let i in stack)
        if(stack[i].tp == 0 && isVisibleAndOntrack(stack[i]))
            return true;
    return false;
}

function getStackHasTap (stack) {
    for(let i in stack) {
        if([4, 8].includes(stack[i].tp))
            return true;
    }
    return false;
}

function isVisibleAndOntrack (note, laneLimit) {
    if(!laneLimit) laneLimit = 5;
    return note.p > -laneLimit && note.p < laneLimit && note.c < 2;
}

function isOntrack (note) {
    return note.p < 5 && note.p > -5;
}

function isVisible (note) {
    return note.c < 2;
}

function modulo (input, divisor) {
    return ((input % divisor) + divisor) % divisor;
}

function getAdjustedLane (notes, index) {
    //convert note if necessary
    let color = notes[index].c % 2;

    //if this is an endpoint, backtrack to get slider color
    if(notes[index].tp == 5) {
        for(let i = index; i >= 0; i--) {
            if(notes[i].tp == 4) {
                color = notes[i].c % 2;
                break;
            }
        }
    }
    return modulo(notes[index].p + 4 * color, 8);
}

function fetchAlignmentPoint (notes, startIndex) {
    //convert notes if necessary
    //this method assumes notes are in order

    //backtrack for a spin, then grab the first positional note after it
    for(let i = startIndex; i >= 0; i--) {
        switch(notes[i].tp) {
            case 2:
            case 3:
                // found a spin
                for(let j = i + 1; j < notes.length; j++) {
                    switch(notes[j].tp) {
                        case 0:
                        case 4:
                        case 8:
                            //found a positional note
                            //check for a stack
                            let laneIndices = [j];
                            let hasMatch = false;
                            for(let k = j + 1; k < notes.length; k++) {
                                if((notes[k].tk - notes[j].tk) < 1000) {
                                    switch(notes[k].tp) {
                                        case 0:
                                            hasMatch = true;
                                        case 4:
                                        case 8:
                                            laneIndices.push(k);
                                    }
                                }
                                else break;
                            }
                            
                            //if stack, average the position of all notes in the stack
                            if(laneIndices.length > 1) {
                                if(hasMatch)
                                    for(let k in laneIndices)
                                        if(notes[laneIndices[k]].tp != 0)
                                            laneIndices.splice(k, 1);
                                let sum = 0;
                                for(let k in laneIndices) {
                                    sum += getAdjustedLane(notes, laneIndices[k]);
                                }
                                // in 4-lane stacks, this might return 4 lanes off
                                // in non-trivial stacks, who knows if i did this right?
                                return sum / laneIndices.length;
                            }

                            //if no stack, position based on this note
                            return getAdjustedLane(notes, j);
                    }
                }
        }
    }
    //if no spin found before the note, take the first positional note's lane instead
    for (let i = 0; i < notes.length; i++) {
        //if positional note found first, return its lane
        if([0, 4, 8].includes(notes[i].tp))
            return getAdjustedLane(notes, i);

        //if spin found first, return 0
        if([2, 3].includes(notes[i].tp))
            return 0;
    }

    //if no positional note or spin in the entire chart, return 0
    return 0;
}

function doesSliderHaveEndpoint(notes, startIndex) {
    for(let i = startIndex + 1; i < notes.length; i++) {
        switch(notes[i].tp) {
            case 2:
            case 3:
            case 4:
            case 12:
                return false;
            case 5:
                return true;
        }
    }
    return false;
}