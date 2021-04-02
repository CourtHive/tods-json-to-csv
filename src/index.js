import { tournamentEngine } from "tods-competition-factory";
import fs from "fs";

export function TODS2CSV({
  count = 1,
  organizationId,
  path,
  tournamentId,
} = {}) {
  if (!path || !organizationId) return { error: "Missing parameters" };

  const orgPath = `${path}/${organizationId}`;

  const files = fs
    .readdirSync(orgPath)
    .filter(
      (filename) =>
        filename.indexOf(".tods.json") > 0 &&
        filename.split(".").reverse()[0] === "json"
    );

  if (tournamentId)
    files = files.filter((file) => file.indexOf(tournamentId) >= 0);

  const csvMatchUps = [];
  let totalMatchUps = 0;
  let totalErrors = 0;

  files.slice(0, count).forEach((file) => {
    const tournamentRaw = fs.readFileSync(`${orgPath}/${file}`, "UTF8");
    const tournamentRecord = JSON.parse(tournamentRaw);
    tournamentEngine.setState(tournamentRecord);
    try {
      let { matchUps } = tournamentEngine.allTournamentMatchUps();
      matchUps = matchUps.filter(
        ({ matchUpStatus, matchUpType }) =>
          ["COMPLETED", "RETIRED", "WALKOVER"].includes(matchUpStatus) &&
          ["SINGLES", "DOUBLES"].includes(matchUpType)
      );
      totalMatchUps += matchUps.length;
      matchUps.forEach((matchUp) => {
        const result = createMatchUpCSV({ matchUp, tournamentRecord });
        if (result.error) {
          totalErrors += 1;
        } else {
          csvMatchUps.push(result.csvMatchUp);
        }
      });
    } catch (err) {
      console.log({ err });
    }
  });

  if (csvMatchUps.length) {
    const replacer = (_, value) => (value === null ? "" : value); // specify how you want to handle null values here
    const header = Object.keys(csvMatchUps[0]);
    const csv = [
      header.join(","), // header row first
      ...csvMatchUps.map((row) =>
        header
          .map((fieldName) => JSON.stringify(row[fieldName], replacer))
          .join(",")
      ),
    ].join("\r\n");
    fs.writeFileSync(`${path}/${organizationId}.csv`, csv, "UTF-8");
  }

  console.log({ totalMatchUps, totalErrors });
}

function createMatchUpCSV({ matchUp, tournamentRecord }) {
  const matchUpType = matchUp.matchUpType;
  const sides = matchUp.sides || [];
  const side1 = sides && sides.find(({ sideNumber }) => sideNumber === 1);
  const side2 = sides && sides.find(({ sideNumber }) => sideNumber === 2);
  const side1participantId = side1 && side1.participantId;
  const side2participantId = side2 && side2.participantId;
  const { participant: side1participant } = tournamentEngine.findParticipant({
    participantId: side1participantId,
  });
  const { participant: side2participant } = tournamentEngine.findParticipant({
    participantId: side2participantId,
  });

  const singles = matchUpType === "SINGLES";
  if (!side1participant || !side2participant)
    return { error: "Missing sideParticipant" };

  const side1ParticipantsIds = singles
    ? [side1participant.participantId]
    : side1participant.individualParticipantIds;
  const side2ParticipantsIds = singles
    ? [side2participant.participantId]
    : side2participant.individualParticipantIds;

  const winningSide = matchUp.winningSide;
  const score =
    winningSide === 2
      ? matchUp.score.scoreStringSide2
      : matchUp.score.scoreStringSide1;

  const MatchUpStartDate =
    matchUp.schedule.scheduledDate || tournamentRecord.startDate;

  const AgeCategoryCode =
    matchUp.category &&
    (matchUp.category.AgeCategoryCode || matchUp.category.categoryName);

  const csvMatchUp = {
    MatchUpID: matchUp.matchUpId,
    Side1Player1ID: findPersonId(side1ParticipantsIds[0]),
    Side1Player2ID: findPersonId(side1ParticipantsIds[1]),
    Side2Player1ID: findPersonId(side2ParticipantsIds[0]),
    Side2Player2ID: findPersonId(side2ParticipantsIds[1]),
    WinningSide: winningSide,
    Score: score,
    MatchUpStatus: convertMatchUpStatus(matchUp.matchUpStatus),
    MatchUpType: matchUpType && matchUpType[0],
    TournamentName: tournamentRecord.tournamentName || tournamentRecord.name,
    TournamentID: tournamentRecord.tournamentId,
    MatchUpFormat: matchUp.matchUpFormat,
    MatchUpStartDate,
    TournamentStartDate: tournamentRecord.startDate,
    TournamentEndDate: tournamentRecord.endDate,
    AgeCategoryCode: convertAgeCategoryCode(AgeCategoryCode),
    TournamentLevel: "NAT",
    Gender: matchUp.gender && matchUp.gender[0],
    DrawId: matchUp.drawId,
    RoundNumber: matchUp.roundNumber,
    RoundPosition: matchUp.roundPosition,
  };

  return { csvMatchUp };
}

function convertAgeCategoryCode(AgeCategoryCode) {
  if (AgeCategoryCode && !isNaN(AgeCategoryCode)) return `U${AgeCategoryCode}`;
  return AgeCategoryCode;
}

function convertMatchUpStatus(matchUpStatus) {
  const mapping = {
    WALKOVER: "WO",
    RETIRED: "RET",
    DEFAULTED: "DEF",
    COMPLETED: "CO",
  };
  return mapping[matchUpStatus];
}

function findPersonId(participantId) {
  if (!participantId) return undefined;
  const { participant } = tournamentEngine.findParticipant({ participantId });
  return participant && participant.person && participant.person.personId;
}

export default TODS2CSV;
