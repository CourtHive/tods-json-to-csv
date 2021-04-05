import {
  tournamentEngine,
  matchUpStatusConstants,
  matchUpTypes,
} from "tods-competition-factory";
import { SingleBar, Presets } from "cli-progress";
import fs from "fs";

const {
  ABANDONED,
  COMPLETED,
  DEFAULTED,
  DEAD_RUBBER,
  DOUBLE_WALKOVER,
  RETIRED,
  WALKOVER,
} = matchUpStatusConstants;

const completedStatuses = [
  ABANDONED,
  COMPLETED,
  DEFAULTED,
  DEAD_RUBBER,
  DOUBLE_WALKOVER,
  RETIRED,
  WALKOVER,
];

const { SINGLES, DOUBLES } = matchUpTypes;

export function TODS2CSV({
  count,
  sourceDir,
  targetDir,
  tournamentId,
  organisationId,
  disableProgress,
  sourceExtnesion = ".tods.json",
} = {}) {
  const sourcePath = sourceDir || ".";
  const targetPath = targetDir || ".";

  let filenames = fs
    .readdirSync(sourcePath)
    .filter(
      (filename) =>
        filename.indexOf(".tods.json") > 0 &&
        filename.split(".").reverse()[0] === "json"
    );
  count = count || filenames.length;

  if (tournamentId) {
    filenames = filenames.filter(
      (filename) => filename.indexOf(tournamentId) >= 0
    );
    count = 1;
  }

  let totalMatchUps = 0;
  const csvMatchUps = [];
  const tournamentDetails = [];
  const processingErrors = [];

  const progressBar = new SingleBar({}, Presets.shades_classic);
  if (!disableProgress) progressBar.start(count, 0);

  filenames.slice(0, count).forEach((filename, index) => {
    const tournamentRaw = fs.readFileSync(`${sourcePath}/${filename}`, "UTF8");
    const tournamentRecord = JSON.parse(tournamentRaw);
    const { tournamentName } = tournamentRecord;

    if (!organisationId) {
      organisationId =
        tournamentRecord.parentOrganisationId ||
        tournamentRecord.unifiedTournamentId?.organisationId;
    }

    const currentOrganisationId =
      tournamentRecord.parentOrganisationId ||
      tournamentRecord.unifiedTournamentId?.organisationId;

    if (organisationId && organisationId === currentOrganisationId) {
      tournamentEngine.setState(tournamentRecord);
      try {
        let { matchUps } = tournamentEngine.allTournamentMatchUps();

        const incompleteMatchUpStatuses = matchUps
          .filter(
            ({ matchUpStatus }) => !completedStatuses.includes(matchUpStatus)
          )
          .reduce(
            (u, { matchUpStatus }) =>
              u.includes(matchUpStatus) ? u : u.concat(matchUpStatus),
            []
          );
        if (disableProgress)
          console.log("incomplete:", { incompleteMatchUpStatuses });

        matchUps = matchUps.filter(
          ({ matchUpStatus, matchUpType }) =>
            completedStatuses.includes(matchUpStatus) &&
            [SINGLES, DOUBLES].includes(matchUpType)
        );
        totalMatchUps += matchUps.length;
        matchUps.forEach((matchUp) => {
          const result = createMatchUpCSV({ matchUp, tournamentRecord });
          if (result.error) {
            processingErrors.push({ result, matchUp });
          } else {
            csvMatchUps.push(result.csvMatchUp);
          }
        });

        tournamentDetails.push({
          matchUpsCount: matchUps.length,
          eventTypes: tournamentRecord.events?.reduce(
            (eventTypes, { eventType }) =>
              eventTypes.includes(eventType)
                ? eventTypes
                : eventTypes.concat(eventType),
            []
          ),
          tournamentName,
          filename,
        });
      } catch (err) {
        console.log({ err });
      }
    }

    if (!disableProgress) progressBar.update(index + 1);
  });

  if (organisationId && csvMatchUps.length) {
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
    fs.writeFileSync(`${targetPath}/${organisationId}.csv`, csv, "UTF-8");
  }

  if (processingErrors.length) {
    fs.writeFileSync(
      `${organisationId}.errors.json`,
      JSON.stringify(processingErrors, undefined, 2),
      "UTF-8"
    );
  }

  if (tournamentDetails.length) {
    fs.writeFileSync(
      `${organisationId}.details.json`,
      JSON.stringify(tournamentDetails, undefined, 2),
      "UTF-8"
    );
  }

  if (!disableProgress) progressBar.stop();

  console.log({
    exportedMatchUps: csvMatchUps.length,
    totalErrors: processingErrors.length,
    tournamentsProcessed: count,
  });
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
    : side1participant.individualParticipantIds || [];
  const side2ParticipantsIds = singles
    ? [side2participant.participantId]
    : side2participant.individualParticipantIds || [];

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
