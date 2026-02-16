import axios from 'axios';
import fs from 'fs';
import XLSX from 'xlsx';
import { buildHtml, escapeHtml } from '../lib/email-helper.js';
import { toWarsawTime } from '../lib/format-helpers.js';

const HR_TRAINING_CONFIG = {
  excelFilePath: process.env.HR_TRAINING_EXCEL_FILE_PATH || 'C:\\cron-temp-files\\hr-trainings.xlsx',
  evaluationDeadlineColumn: process.env.HR_TRAINING_DEADLINE_COLUMN || 'Z',
  supervisorNameColumn: process.env.HR_TRAINING_NAME_COLUMN || 'W',
  trainingNameColumn: process.env.HR_TRAINING_TRAINING_NAME_COLUMN || 'C',
  traineeNameColumn: process.env.HR_TRAINING_TRAINEE_NAME_COLUMN || 'J',
  sheetName: process.env.HR_TRAINING_SHEET_NAME || null,
  evaluationResultColumn: process.env.HR_TRAINING_EVALUATION_RESULT_COLUMN || 'AC',
};

function removePlPolishCharacters(text) {
  const polishToLatin = {
    ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
    Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
  };
  return text.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (char) => polishToLatin[char] || char);
}

function convertNameToEmail(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length < 2) {
    console.warn(`Invalid name format: "${fullName}" - expected "Surname Firstname"`);
    return null;
  }
  const surname = removePlPolishCharacters(nameParts[0]).toLowerCase();
  const firstname = removePlPolishCharacters(nameParts[1]).toLowerCase();
  return `${firstname}.${surname}@bruss-group.com`;
}

function getTodaysDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseTrainingEvaluationDate(cellValue) {
  if (!cellValue) return null;
  if (cellValue instanceof Date) return cellValue;
  if (typeof cellValue === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const days = cellValue - 2;
    return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
  }
  if (typeof cellValue === 'string') {
    const parsed = new Date(cellValue);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function excelColumnToIndex(letter) {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return result - 1;
}

export async function sendHrTrainingEvaluationNotification(
  supervisorEmail,
  supervisorName,
  trainingName,
  evaluationDeadline
) {
  try {
    const deadlineDate = new Date(evaluationDeadline);
    const formattedDate = deadlineDate.toLocaleDateString('pl-PL');
    const nameParts = supervisorName ? supervisorName.trim().split(/\s+/) : [];
    const firstName = nameParts.length >= 2 ? nameParts[1] : nameParts[0] || '';
    const safeTrainingName = escapeHtml(trainingName);

    const subject = `Przypomnienie HR: Ocena efektywności szkoleń - ${safeTrainingName}`;
    const content = `
      <p>Dzień dobry${firstName ? ` ${firstName}` : ''},</p>
      <p>W dniu <strong>${formattedDate}</strong> mija termin wymaganego dokonania oceny efektywności zrealizowanych szkoleń w Twoim zespole.</p>
      <p><strong>Szkolenie:</strong> ${safeTrainingName}</p>
      <p>Proszę o pilne dokonanie oceny efektywności tych szkoleń w dostępnym pliku: <strong>W:\\HrManagement\\1_Szkolenia\\2_PHR-7.2.01-01_PLAN SZKOLEŃ</strong>.</p>
      <p>Pomoże nam to w przyszłości w podjęciu decyzji dotyczących szkoleń w podobnych obszarach lub tematyce.</p>
      <p>W razie pytań lub wątpliwości, skontaktuj się z działem HR.<br/>Z góry bardzo dziękujemy za rzetelność i terminowość.</p>
      <p style="margin-top:2em;">Z poważaniem,<br/>Dział HR</p>
    `;
    const html = buildHtml(content);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Sending email to: ${supervisorEmail} | Subject: ${subject}`);
    }

    await axios.post(`${process.env.API_URL}/mailer`, { to: supervisorEmail, subject, html });
    return { success: true, email: supervisorEmail };
  } catch (error) {
    console.error(`Error sending HR training evaluation email to ${supervisorEmail}:`, error.message);
    return { success: false, email: supervisorEmail, error: error.message };
  }
}

async function sendHrErrorOrSummaryEmail(subject, html) {
  try {
    const hrEmail = process.env.HR_EMAIL;
    if (!hrEmail) {
      console.error('HR_EMAIL is not configured in environment variables');
      return;
    }
    await axios.post(`${process.env.API_URL}/mailer`, { to: hrEmail, subject, html });
  } catch (error) {
    console.error(`Error sending HR error/summary email:`, error.message);
  }
}

export async function sendHrTrainingEvaluationNotifications() {
  const startTime = new Date();
  console.log(`Starting HR training evaluation deadline notifications check at ${startTime.toLocaleString()}`);

  try {
    if (!fs.existsSync(HR_TRAINING_CONFIG.excelFilePath)) {
      console.error(`HR training Excel file not found: ${HR_TRAINING_CONFIG.excelFilePath}`);
      await sendHrErrorOrSummaryEmail(
        'Brak pliku do oceny szkoleń HR',
        `<p>Nie odnaleziono pliku z oceną szkoleń HR pod wskazaną ścieżką:<br/><strong>${HR_TRAINING_CONFIG.excelFilePath}</strong></p>`
      );
      return;
    }

    const workbook = XLSX.readFile(HR_TRAINING_CONFIG.excelFilePath);
    const sheetName = HR_TRAINING_CONFIG.sheetName || workbook.SheetNames[0];

    if (!workbook.Sheets[sheetName]) {
      console.error(`HR training sheet "${sheetName}" not found in Excel file`);
      return;
    }

    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    const evaluationDeadlineColIndex = excelColumnToIndex(HR_TRAINING_CONFIG.evaluationDeadlineColumn);
    const supervisorNameColIndex = excelColumnToIndex(HR_TRAINING_CONFIG.supervisorNameColumn);
    const trainingNameColIndex = excelColumnToIndex(HR_TRAINING_CONFIG.trainingNameColumn);
    const traineeNameColIndex = excelColumnToIndex(HR_TRAINING_CONFIG.traineeNameColumn);
    const evaluationResultColIndex = excelColumnToIndex(HR_TRAINING_CONFIG.evaluationResultColumn);

    const todaysDate = getTodaysDate();
    console.log(`Checking for HR training evaluation deadlines on or before: ${todaysDate.toLocaleDateString('pl-PL')}`);

    let processedRows = 0;
    let hrNotificationsSent = 0;
    let errors = [];
    let invalidSupervisorRows = [];
    let skippedEvaluations = 0;

    for (let row = 7; row <= range.e.r; row++) {
      processedRows++;

      const deadlineCellAddress = XLSX.utils.encode_cell({ r: row, c: evaluationDeadlineColIndex });
      const nameCellAddress = XLSX.utils.encode_cell({ r: row, c: supervisorNameColIndex });
      const trainingCellAddress = XLSX.utils.encode_cell({ r: row, c: trainingNameColIndex });
      const traineeCellAddress = XLSX.utils.encode_cell({ r: row, c: traineeNameColIndex });
      const evaluationResultCellAddress = XLSX.utils.encode_cell({ r: row, c: evaluationResultColIndex });

      const deadlineValue = worksheet[deadlineCellAddress]?.v;
      const nameValue = worksheet[nameCellAddress]?.v;
      const trainingValue = worksheet[trainingCellAddress]?.v;
      const traineeValue = worksheet[traineeCellAddress]?.v;
      const evaluationResultValue = worksheet[evaluationResultCellAddress]?.v;

      if (!traineeValue || typeof traineeValue !== 'string') continue;

      if (!nameValue || typeof nameValue !== 'string') {
        invalidSupervisorRows.push({ row: row + 1, nameValue, reason: 'Brak lub nieprawidłowe dane przełożonego' });
        continue;
      }

      if (evaluationResultValue !== undefined && evaluationResultValue !== null && evaluationResultValue !== '') {
        skippedEvaluations++;
        continue;
      }

      const parsedDeadline = parseTrainingEvaluationDate(deadlineValue);
      if (!parsedDeadline) continue;

      if (parsedDeadline <= todaysDate) {
        const supervisorEmail = convertNameToEmail(nameValue);
        const result = await sendHrTrainingEvaluationNotification(
          supervisorEmail,
          nameValue,
          trainingValue,
          parsedDeadline
        );

        if (result.success) {
          hrNotificationsSent++;
        } else {
          errors.push(result);
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);

    console.log(`HR training evaluation notifications completed at ${endTime.toLocaleString()}`);
    console.log(`Duration: ${duration}s | Processed: ${processedRows} rows | HR notifications sent: ${hrNotificationsSent}`);

    if (errors.length > 0) {
      console.log(`HR training evaluation errors encountered: ${errors.length}`);
      errors.forEach((error) => {
        console.error(`Failed to send HR training notification to ${error.email}: ${error.error}`);
      });
    }

    const summaryHtml = `
      <h3>Podsumowanie powiadomień o ocenie szkoleń HR</h3>
      <p><strong>Przetworzone wiersze:</strong> ${processedRows}</p>
      <p><strong>Wysłane powiadomienia:</strong> ${hrNotificationsSent}</p>
      <p><strong>Błędy (brakujące/nieprawidłowe dane przełożonych):</strong> ${invalidSupervisorRows.length}</p>
      ${invalidSupervisorRows.length > 0 ? `<ul>${invalidSupervisorRows.map((e) => `<li>Wiersz ${e.row}: ${e.nameValue || '(puste)'} - ${e.reason}</li>`).join('')}</ul>` : ''}
      <p><strong>Wykonane oceny bez aktualizacji daty:</strong> ${skippedEvaluations}</p>
      <p><strong>Inne błędy powiadomień:</strong> ${errors.length}</p>
      ${errors.length > 0 ? `<ul>${errors.map((e) => `<li>${e.email}: ${e.error}</li>`).join('')}</ul>` : ''}
      <p>Czas trwania: ${duration}s</p>
      <p>Uruchomienie skryptu: ${toWarsawTime(startTime)} - ${toWarsawTime(endTime)}</p>
    `;
    await sendHrErrorOrSummaryEmail('Podsumowanie powiadomień o ocenie szkoleń HR', summaryHtml);
  } catch (error) {
    console.error('Error in sendHrTrainingEvaluationNotifications:', error);
    throw error;
  }
}
