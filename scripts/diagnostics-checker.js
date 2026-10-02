function checkUnmissableNotes (notes) {
    let report = [];
    //if wrong encoding, change encoding
    
    for(let i = 0; i < notes.length;) {
        let j = i + 1;
        let stackIndices = [i];
        while(j < notes.length) {
            if(notes[j].tk - notes[i].tk < 100) {
                stackIndices.push(j);
                j++;
            }
            else break;
        }

        // skip if 0 notes or 1 visible note
        if(stackIndices.length < 1 || (stackIndices.length == 1
                && isVisibleAndOntrack(notes[stackIndices[0]]))) {
            i++;
            continue;
        }

        // remove all irrevelant note types (spins, scratches, beats, beatholds)
        let hasTap = false;
        for(let k = 0; k < stackIndices.length; k++) {
            switch(notes[stackIndices[k]].tp) {
                case 5: // slider endpoint
                    // reject endpoint if it's a release or not part of a slider
                    if(!isEndpointSlider(notes, i) || isEndpointRelease(notes, i)) {
                        stackIndices.splice(k, 1);
                        k--;
                        break;
                    }
                case 0: // match
                    break;
                case 4: // slider (not fully safe)
                case 8: // tap (not fully safe)
                    hasTap = true;
                default:
                    stackIndices.splice(k, 1);
                    k--;
            }
        }

        // skip if 0 notes or 1 visible note
        if(stackIndices.length < 1 || (stackIndices.length == 1
                && isVisibleAndOntrack(notes[stackIndices[0]]))) {
            i++;
            continue;
        }


        // skip if all matches are visible and on-track
        if(!getStackHasInvisOrOfftrack(indsToNotes(notes, stackIndices))) {
            i = j;
            continue;
        }

        let stack = indsToNotes(notes, stackIndices);

        //check for missable via misalignment
        let aPoint = fetchAlignmentPoint(notes, stackIndices[0]);
        let pos = getPotentialPlayerPosition(notes, stackIndices[0]);
        if(!pos || pos.lane != pos.lane) {
            console.error("failed to calculate position");
            console.log(pos);
            console.log(notes[i]);
        }
        if(pos.lane == "aPoint") {
            pos.lane = aPoint;
            pos.spread = 0;
        }
        let misalignReport, perfectMisalignReport;
        let longest = getLargestGapInStack(stack);
        if(longest > 3) { // missable by misalignment
            misalignReport = checkForMisalign(notes, stackIndices);
            if(misalignReport)
                report.push(misalignReport);
        }
        else if(longest == 3) { // possibly missable by perfect misalignment
            perfectMisalignReport = checkForPerfectMisalign(notes, stackIndices);
            if(perfectMisalignReport)
                report.push(perfectMisalignReport);
        }

        // check for time mismatch
        let substacks = [[stackIndices[0]]];
        for(let k = 1; k < stack.length; k++) {
            let placed = false;
            for(let s in substacks) {
                if(notes[substacks[s][0]].tk == stack[k].tk) {
                    substacks[s].push(stackIndices[k]);
                    placed = true;
                    break;
                }
            }
            if(!placed) substacks.push([stackIndices[k]]);
        }
        let substacksReport;
        if(substacks.length > 1) {
            // if any of the substacks contain unprotected off-track or invis matches
            for(let k in substacks) {
                let longest = getLargestGapInStack(indsToNotes(substacks[k]));
                if(getStackHasInvisOrOfftrack(indsToNotes(substacks[k]))) {
                    if(longest > 3) {
                        let ret = checkForMisalign(notes, substacks[k]);
                        if(!substacksReport || substacksReport.severity < report.severity) {
                            substacksReport = ret;
                        }
                    }
                    else if(longest == 3) {
                        let ret = checkForPerfectMisalign(notes, substacks[k]);
                        if(!substacksReport || substacksReport.severity < report.severity) {
                            substacksReport = ret;
                        }
                    }
                }
            }

            let mainReport = misalignReport ? misalignReport : perfectMisalignReport;
            if(substacksReport && (!mainReport || substacksReport.severity > mainReport.severity)) {
                let maxOffset = stack[stack.length - 1].tk - stack[0].tk;
                let offsetSeverity = substacksReport.severity;
                if(maxOffset < 50) offsetSeverity -= 1;
                if(offsetSeverity < 0) offsetSeverity = 0;
                report.push({
                    type: "Offset time",
                    desc: "Notes in stack occur at slightly different timings from each other, "
                        + "which gives them a notable chance of being missed",
                    severity: offsetSeverity,
                    note: stack[0]
                });
            }
        }

        
        
        //check for invisible notes near spins
        let allInvisMatches = false;
        for(let k in stack) {
            if(stack[k].c > 1 && stack[k].tp == 0)
                allInvisMatches = true;
            if(stack[k].c < 2 && [0, 4, 8].includes(stack[k].tp)) {
                allInvisMatches = false;
                break;
            }
        }
        if(allInvisMatches) {
            for(let k = i + 1; k < notes.length; k++) {
                if(notes[k].tk - notes[i].tk > 6000) break; // break after 60ms
                if([0, 4, 8].includes(notes[k].tp) && notes[k].c < 2) break; // break if a visible note precedes spin
                if(notes[k].tp == 2 || notes[k].tp == 3) {
                    let sev = 0;
                    if(notes[k].tk - notes[i].tk < 1000) sev = 3 //10ms
                    else if(notes[k].tk - notes[i].tk < 2000) sev = 2; //20ms
                    else if(notes[k].tk - notes[i].tk < 3500) sev = 1; //35ms
                    report.push({
                        type: "Invisible near spin",
                        desc: "Invisible matches can be missed when spinning early",
                        severity: sev,
                        note: stack[0]
                    });
                }
            }
        }

        i = j;
    }
    return report;
}

function checkForMisalign (notes, indices) {
    let stack = indsToNotes(notes, indices);
    let aPoint = fetchAlignmentPoint(notes, indices[0]);
    let pos = getPotentialPlayerPosition(notes, indices[0]);
    if(!pos || pos.lane != pos.lane) {
        throw error(`failed to calculate player position at t=${notes[i].tk/100000}`);
    }
    if(pos.lane == "aPoint") {
        pos.lane = aPoint;
        pos.spread = 0;
    }

    // only check for misalignment if all notes are invisible/offtrack
    if(!getStackHasVis(stack)) {
        let severity, desc;
        let testSpread = 0;
        let pass = false;
        let nGood = 0, nBad = 0;
        //test all positions within the spread
        while(testSpread <= pos.spread) {
            pass = false;
            for(let k in indices) {
                if(notes[indices[k]].tp == 0) {
                    let distance = Math.abs(getAdjustedLane(notes, indices[k]) + testSpread - pos.lane);
                    if(distance > 4) distance = 8 - distance;
                    if(distance < 2) {
                        pass = true;
                        break;
                    }
                }
            }
            if(pass) nGood++;
            else {
                nBad++;
                // console.log(`missed. t=${stack[0].tk/100000}, pos=${pos.lane}, spread=${pos.spread}`);
            }
            if(testSpread > 0) testSpread *= -1;
            else testSpread = testSpread * -1 + 0.5;
        }

        let descriptor = getStackHasInvis(stack) ? "Invisible" : "Offtrack";
        let stackType = getNumMatchesInStack(stack) == 1 ? "note" : "stack";

        let rate = nGood / (nGood + nBad);
        if(rate < 0.1) {
            // console.log(`${stack[0].tk/100000}: ${nGood}::${nBad}, p=${pos.lane}, ${pos.spread}`);
            severity = 3;
            desc = descriptor + " " + stackType + " is missable, and the player "
                + "is very likely to be in a position to miss it";
        }
        else if(rate < 0.5) {
            severity = 2;
            desc = descriptor + " " + stackType + " is missable, and the player "
                + "is likely in a position to miss it";
        }
        else if(rate < 1) {
            severity = 1;
            desc = descriptor + " " + stackType + " is missable, and the player "
                + "could potentially to be in a position to miss it";
        }
        else {
            severity = 0;
            desc = descriptor + " " + stackType + " is missable, but the player "
                + "shouldn't be in a position to miss it";
        }
        return{
            type: "Missable " + descriptor,
            desc: desc,
            severity: severity,
            note: stack[0]
        };
    }
}

function checkForPerfectMisalign (notes, indices) {
    let aPoint = fetchAlignmentPoint(notes, indices[0]);
    let stack = indsToNotes(notes, indices);

    // zeroLane is one of the misalign points
    let zeroLane = getAdjustedLane(notes, indices[0]);
    for(let i in indices)
        if(getAdjustedLane(notes, indices[i]) != zeroLane
                && getAdjustedLane(notes, indices[i]) != (zeroLane + 4) % 8)
            zeroLane = getAdjustedLane(notes, indices[i])
    
    // if this stack hits the misalign points and doesn't have any visible matches
    if((modulo(aPoint - zeroLane, 8) == 2
            || modulo(aPoint - zeroLane, 8) == 6)
            && !getStackHasVisMatch(stack)) {
        // skip if a note aligns with aPoint
        for(let i in indices) {
            let distance = Math.abs(getAdjustedLane(notes, indices[i]) - aPoint);
            if(distance > 4) distance = 8 - distance;
            if(distance < 2)
                return;
        }

        let pos = getPotentialPlayerPosition(notes, indices[0]);

        // this 4-lane stack is vulnerable to perfect misalignment
        if(pos.lane == aPoint && pos.spread == 0) {
            return {
                type: "Perfect misalignment",
                desc: "Stacked matches can be missed by misaligning perfectly, "
                    + "and the player is almost certain to be in such a position",
                severity: 3,
                note: stack[0]
            };
        }
        else {
            let min = modulo(pos.lane - pos.spread, 8),
                max = modulo(pos.lane + pos.spread, 8);
            let drift = getPotentialPlayerDrift(notes, indices[0]);
            // console.warn(notes[indices[0]].tk/100000);
            // console.log(drift);

            let hit = false;
            if(min < max && aPoint >= min && aPoint <= max)
                hit = true;
            else if(min > max && (aPoint <= max || aPoint >= min))
                hit = true;

            if(hit && !getStackHasVis(stack)) {
                if(Math.abs(drift.drift) < 4) {
                    return {
                        type: "Perfect misalignment",
                        desc: "Stacked matches can be missed by misaligning perfectly, "
                            + "and the player could potentially be in such a position",
                        severity: 2,
                        note: stack[0]
                    };
                }
                if(Math.abs(drift.drift) < 8 && (drift.drift + drift.leftAmbiguity >= -4
                        || drift.drift - drift.rightAmbiguity <= 4)) {
                    return {
                        type: "Perfect misalignment",
                        desc: "Stacked matches can be missed by misaligning perfectly, "
                            + "and the player could potentially be in such a position "
                            + "depending on how they handle color-swaps",
                        severity: 2,
                        note: stack[0]
                    };
                }
                if(drift.drift + drift.leftAmbiguity >= -4
                        || drift.drift - drift.rightAmbiguity <= 4) {
                    return {
                        type: "Perfect misalignment",
                        desc: "Stacked matches can be missed by misaligning perfectly, "
                            + "and the player could potentially be in such a position "
                            + "if they handle movement in an unusual way",
                        severity: 1,
                        note: stack[0]
                    };
                }
            }
            else if(!getStackHasVis(stack))
                return {
                    type: "Perfect misalignment",
                    desc: "Stacked matches can be missed by misaligning perfectly, "
                        + "but the player shouldn't be in such a position",
                    severity: 0,
                    note: stack[0]
                };
        }
    }
}

function checkForEndlessSliders (notes) {
    let report = [];
    //ensure the right encoding
    for(let i = 0; i < notes.length; i++) {
        if(notes[i].tp == 4) {
            if(!doesSliderHaveEndpoint(notes, i)) {
                report.push({
                    type: "Slider with no endpoint",
                    desc: "This slider reduces score and results in a bugged combo",
                    severity: 3,
                    note: notes[i]
                });
            }
        }
    }
    return report;
}