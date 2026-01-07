/**
 * Trilingual email translation utility (PL/EN/DE)
 */

// ============================================================================
// SECURITY: HTML ESCAPING
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Color scheme for language sections
export const LANG_COLORS = {
  PL: '#1976d2', // Blue
  EN: '#4caf50', // Green
  DE: '#ff9800', // Orange
};

// ============================================================================
// DEVIATION TRANSLATIONS
// ============================================================================

export const DEVIATIONS = {
  roles: {
    'group-leader': { PL: 'Group Leader', EN: 'Group Leader', DE: 'Gruppenleiter' },
    'quality-manager': { PL: 'Kierownik Jakości', EN: 'Quality Manager', DE: 'Qualitätsleiter' },
    'production-manager': { PL: 'Kierownik Produkcji', EN: 'Production Manager', DE: 'Produktionsleiter' },
    'plant-manager': { PL: 'Dyrektor Zakładu', EN: 'Plant Manager', DE: 'Werksleiter' },
  },
  buttons: {
    goToDeviation: { PL: 'Przejdź do odchylenia', EN: 'Go to deviation', DE: 'Zur Abweichung' },
  },
  subjects: {
    awaitingApproval: (id, roleKey) => {
      const safeId = escapeHtml(id);
      const role = DEVIATIONS.roles[roleKey] || { PL: escapeHtml(roleKey), EN: escapeHtml(roleKey), DE: escapeHtml(roleKey) };
      return {
        PL: `Odchylenie [${safeId}] - oczekuje na zatwierdzenie (${role.PL})`,
        EN: `Deviation [${safeId}] - awaiting approval (${role.EN})`,
        DE: `Abweichung [${safeId}] - wartet auf Genehmigung (${role.DE})`,
      };
    },
    vacancy: (id, roleKey) => {
      const safeId = escapeHtml(id);
      const role = DEVIATIONS.roles[roleKey] || { PL: escapeHtml(roleKey), EN: escapeHtml(roleKey), DE: escapeHtml(roleKey) };
      return {
        PL: `Odchylenie [${safeId}] - oczekuje na zatwierdzenie (wakat ${role.PL})`,
        EN: `Deviation [${safeId}] - awaiting approval (vacancy ${role.EN})`,
        DE: `Abweichung [${safeId}] - wartet auf Genehmigung (Vakanz ${role.DE})`,
      };
    },
    plantManagerFinal: (id) => {
      const safeId = escapeHtml(id);
      return {
        PL: `Odchylenie [${safeId}] - oczekuje na zatwierdzenie (Dyrektor Zakładu)`,
        EN: `Deviation [${safeId}] - awaiting approval (Plant Manager)`,
        DE: `Abweichung [${safeId}] - wartet auf Genehmigung (Werksleiter)`,
      };
    },
  },
  messages: {
    awaitingRole: (id, roleKey) => {
      const safeId = escapeHtml(id);
      const role = DEVIATIONS.roles[roleKey] || { PL: escapeHtml(roleKey), EN: escapeHtml(roleKey), DE: escapeHtml(roleKey) };
      return {
        PL: `Odchylenie [${safeId}] oczekuje ponad 72h na zatwierdzenie w roli: ${role.PL}.`,
        EN: `Deviation [${safeId}] has been awaiting approval for over 72h in role: ${role.EN}.`,
        DE: `Abweichung [${safeId}] wartet seit über 72 Stunden auf Genehmigung in der Rolle: ${role.DE}.`,
      };
    },
    plantManagerFinal: (id) => {
      const safeId = escapeHtml(id);
      return {
        PL: `Odchylenie [${safeId}] zostało zatwierdzone przez wszystkie inne stanowiska i czeka ponad 72h na zatwierdzenie przez Dyrektora Zakładu.`,
        EN: `Deviation [${safeId}] has been approved by all other positions and has been awaiting Plant Manager approval for over 72h.`,
        DE: `Abweichung [${safeId}] wurde von allen anderen Positionen genehmigt und wartet seit über 72 Stunden auf die Genehmigung des Werksleiters.`,
      };
    },
    vacancy: (id, roleKey) => {
      const safeId = escapeHtml(id);
      const role = DEVIATIONS.roles[roleKey] || { PL: escapeHtml(roleKey), EN: escapeHtml(roleKey), DE: escapeHtml(roleKey) };
      return {
        PL: `Odchylenie [${safeId}] oczekuje ponad 72h na zatwierdzenie. Powiadomienie wysłano do Dyrektora Zakładu z powodu wakatu na stanowisku: ${role.PL}.`,
        EN: `Deviation [${safeId}] has been awaiting approval for over 72h. Notification sent to Plant Manager due to vacancy in position: ${role.EN}.`,
        DE: `Abweichung [${safeId}] wartet seit über 72 Stunden auf Genehmigung. Benachrichtigung an den Werksleiter wegen Vakanz in der Position: ${role.DE}.`,
      };
    },
  },
};

// ============================================================================
// OVERTIME TRANSLATIONS
// ============================================================================

export const OVERTIME = {
  buttons: {
    goToOrders: { PL: 'Przejdź do zleceń', EN: 'Go to orders', DE: 'Zu den Aufträgen' },
  },
  subjects: {
    pendingApproval: {
      PL: 'Oczekujące zlecenia wykonania pracy w godzinach nadliczbowych - produkcja',
      EN: 'Pending production overtime work orders',
      DE: 'Ausstehende Produktionsüberstundenaufträge',
    },
    pendingPreApproval: {
      PL: 'Zlecenia nadgodzin oczekujące na wstępną akceptację',
      EN: 'Overtime orders awaiting pre-approval',
      DE: 'Überstundenaufträge warten auf Vorabgenehmigung',
    },
    preApprovedAwaitingFinal: {
      PL: 'Wstępnie zaakceptowane zlecenia nadgodzin oczekują na zatwierdzenie',
      EN: 'Pre-approved overtime orders awaiting final approval',
      DE: 'Vorabgenehmigte Überstundenaufträge warten auf Genehmigung',
    },
    attendanceReminder: {
      PL: 'Zlecenia wykonania pracy w godzinach nadliczbowych - produkcja - oczekuje na dodanie listy obecności',
      EN: 'Production overtime work orders - awaiting attendance list',
      DE: 'Produktionsüberstundenaufträge - Anwesenheitsliste erforderlich',
    },
  },
  messages: {
    pendingCount: (count) => {
      const safeCount = Number(count) || 0;
      return {
        PL: `Masz ${safeCount} ${safeCount === 1 ? 'oczekujące zlecenie' : 'oczekujące zlecenia'} wykonania pracy w godzinach nadliczbowych - produkcja.`,
        EN: `You have ${safeCount} pending production overtime work order${safeCount === 1 ? '' : 's'}.`,
        DE: `Sie haben ${safeCount} ausstehende${safeCount === 1 ? 'n' : ''} Produktionsüberstundenauftrag${safeCount === 1 ? '' : 'saufträge'}.`,
      };
    },
    pendingPreApprovalCount: (count) => {
      const safeCount = Number(count) || 0;
      return {
        PL: `Masz ${safeCount} ${safeCount === 1 ? 'zlecenie nadgodzin oczekujące' : 'zleceń nadgodzin oczekujących'} na wstępną akceptację.`,
        EN: `You have ${safeCount} overtime order${safeCount === 1 ? '' : 's'} awaiting pre-approval.`,
        DE: `Sie haben ${safeCount} Überstundenauftrag${safeCount === 1 ? '' : 'saufträge'}, der auf Vorabgenehmigung wartet.`,
      };
    },
    preApprovedCount: (count) => {
      const safeCount = Number(count) || 0;
      return {
        PL: `Masz ${safeCount} wstępnie ${safeCount === 1 ? 'zaakceptowane zlecenie nadgodzin oczekujące' : 'zaakceptowanych zleceń nadgodzin oczekujących'} na finalne zatwierdzenie.`,
        EN: `You have ${safeCount} pre-approved overtime order${safeCount === 1 ? '' : 's'} awaiting final approval.`,
        DE: `Sie haben ${safeCount} vorabgenehmigte${safeCount === 1 ? 'n' : ''} Überstundenauftrag${safeCount === 1 ? '' : 'saufträge'}, der auf Genehmigung wartet.`,
      };
    },
    pendingLogisticsAndPreApprovedCount: (pendingLogistics, preApproved) => {
      const safePending = Number(pendingLogistics) || 0;
      const safePreApproved = Number(preApproved) || 0;
      const total = safePending + safePreApproved;
      return {
        PL: `Masz ${total} ${total === 1 ? 'zlecenie nadgodzin oczekujące' : 'zleceń nadgodzin oczekujących'} na zatwierdzenie${safePending > 0 ? ` (${safePending} logistyka)` : ''}${safePreApproved > 0 ? ` (${safePreApproved} wstępnie zaakceptowane)` : ''}.`,
        EN: `You have ${total} overtime order${total === 1 ? '' : 's'} awaiting approval${safePending > 0 ? ` (${safePending} logistics)` : ''}${safePreApproved > 0 ? ` (${safePreApproved} pre-approved)` : ''}.`,
        DE: `Sie haben ${total} Überstundenauftrag${total === 1 ? '' : 'saufträge'} zur Genehmigung${safePending > 0 ? ` (${safePending} Logistik)` : ''}${safePreApproved > 0 ? ` (${safePreApproved} vorabgenehmigt)` : ''}.`,
      };
    },
    attendanceCount: (count) => {
      const safeCount = Number(count) || 0;
      return {
        PL: `${safeCount === 1 ? 'Zlecenie wykonania pracy w godzinach nadliczbowych - produkcja oczekuje' : `${safeCount} zleceń wykonania pracy w godzinach nadliczbowych - produkcja oczekuje`} na dodanie listy obecności.`,
        EN: `${safeCount} production overtime work order${safeCount === 1 ? ' is' : 's are'} awaiting attendance list.`,
        DE: `${safeCount} Produktionsüberstundenauftrag${safeCount === 1 ? ' wartet' : 'saufträge warten'} auf Anwesenheitsliste.`,
      };
    },
  },
};

// ============================================================================
// HR TRAINING TRANSLATIONS
// ============================================================================

export const HR_TRAINING = {
  subjects: {
    evaluationReminder: (trainingName) => {
      const safeName = escapeHtml(trainingName);
      return {
        PL: `Przypomnienie HR: Ocena efektywności szkoleń - ${safeName}`,
        EN: `HR Reminder: Training effectiveness evaluation - ${safeName}`,
        DE: `HR-Erinnerung: Bewertung der Schulungseffektivität - ${safeName}`,
      };
    },
  },
  messages: {
    greeting: (firstName) => {
      const safeName = escapeHtml(firstName);
      return {
        PL: `Dzień dobry${safeName ? ` ${safeName}` : ''},`,
        EN: `Hello${safeName ? ` ${safeName}` : ''},`,
        DE: `Guten Tag${safeName ? ` ${safeName}` : ''},`,
      };
    },
    deadlineInfo: (formattedDatePL, formattedDateEN, formattedDateDE) => ({
      PL: `W dniu <strong>${escapeHtml(formattedDatePL)}</strong> mija termin wymaganego dokonania oceny efektywności zrealizowanych szkoleń w Twoim zespole.`,
      EN: `The deadline for completing the effectiveness evaluation of completed trainings in your team is <strong>${escapeHtml(formattedDateEN)}</strong>.`,
      DE: `Am <strong>${escapeHtml(formattedDateDE)}</strong> endet die Frist für die erforderliche Bewertung der Wirksamkeit der durchgeführten Schulungen in Ihrem Team.`,
    }),
    trainingLabel: {
      PL: 'Szkolenie:',
      EN: 'Training:',
      DE: 'Schulung:',
    },
    filePathInfo: {
      PL: 'Proszę o pilne dokonanie oceny efektywności tych szkoleń w dostępnym pliku: <strong>W:\\HrManagement\\1_Szkolenia\\2_PHR-7.2.01-01_PLAN SZKOLEŃ</strong>.',
      EN: 'Please urgently complete the effectiveness evaluation of these trainings in the available file: <strong>W:\\HrManagement\\1_Szkolenia\\2_PHR-7.2.01-01_PLAN SZKOLEŃ</strong>.',
      DE: 'Bitte führen Sie dringend die Wirksamkeitsbewertung dieser Schulungen in der verfügbaren Datei durch: <strong>W:\\HrManagement\\1_Szkolenia\\2_PHR-7.2.01-01_PLAN SZKOLEŃ</strong>.',
    },
    helpInfo: {
      PL: 'Pomoże nam to w przyszłości w podjęciu decyzji dotyczących szkoleń w podobnych obszarach lub tematyce.',
      EN: 'This will help us make decisions about training in similar areas or topics in the future.',
      DE: 'Dies wird uns in Zukunft bei Entscheidungen über Schulungen in ähnlichen Bereichen oder Themen helfen.',
    },
    contactInfo: {
      PL: 'W razie pytań lub wątpliwości, skontaktuj się z działem HR.<br/>Z góry bardzo dziękujemy za rzetelność i terminowość.',
      EN: 'If you have any questions or concerns, please contact the HR department.<br/>Thank you in advance for your diligence and timeliness.',
      DE: 'Bei Fragen oder Bedenken wenden Sie sich bitte an die Personalabteilung.<br/>Vielen Dank im Voraus für Ihre Sorgfalt und Pünktlichkeit.',
    },
    signature: {
      PL: 'Z poważaniem,<br/>Dział HR',
      EN: 'Best regards,<br/>HR Department',
      DE: 'Mit freundlichen Grüßen,<br/>Personalabteilung',
    },
  },
};

// ============================================================================
// OVERTIME SUBMISSIONS TRANSLATIONS
// ============================================================================

export const OVERTIME_SUBMISSIONS = {
  subjects: {
    balanceReminder: {
      PL: 'Przypomnienie: nierozliczone nadgodziny',
      EN: 'Reminder: unsettled overtime hours',
      DE: 'Erinnerung: nicht abgerechnete Überstunden',
    },
    monthEndReport: {
      PL: 'Raport: nierozliczone nadgodziny - koniec miesiąca',
      EN: 'Report: unsettled overtime hours - month end',
      DE: 'Bericht: nicht abgerechnete Überstunden - Monatsende',
    },
  },
  messages: {
    balancePositive: (hours) => ({
      PL: `Masz ${hours}h nadgodzin do odbioru. Rozlicz je przed końcem miesiąca lub zostaną przekazane do wypłaty.`,
      EN: `You have ${hours}h overtime to claim. Settle before month end or they will be converted to payout.`,
      DE: `Sie haben ${hours}h Überstunden abzurufen. Vor Monatsende abrechnen oder sie werden zur Auszahlung umgestellt.`,
    }),
    balanceNegative: (hours) => ({
      PL: `Masz ${Math.abs(hours)}h do odpracowania. Rozlicz przed końcem miesiąca.`,
      EN: `You have ${Math.abs(hours)}h to work off. Settle before month end.`,
      DE: `Sie haben ${Math.abs(hours)}h abzuarbeiten. Vor Monatsende abrechnen.`,
    }),
    monthEndSummary: (usersData) => {
      // usersData is array of { email, displayName, hours, count }
      const rows = usersData.map(u =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(u.displayName || u.email)}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${u.hours}h</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${u.count}</td></tr>`
      ).join('');
      const table = `<table style="border-collapse:collapse;margin:10px 0;"><thead><tr><th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Pracownik</th><th style="padding:4px 8px;border:1px solid #ddd;">Godziny</th><th style="padding:4px 8px;border:1px solid #ddd;">Wpisy</th></tr></thead><tbody>${rows}</tbody></table>`;
      return {
        PL: `<p>Poniżej lista pracowników z nierozliczonymi nadgodzinami na koniec miesiąca:</p>${table}<p>Możesz oznaczyć wybrane wpisy do wypłaty w systemie.</p>`,
        EN: `<p>Below is a list of employees with unsettled overtime at month end:</p>${table}<p>You can mark selected entries for payout in the system.</p>`,
        DE: `<p>Nachfolgend eine Liste der Mitarbeiter mit nicht abgerechneten Überstunden am Monatsende:</p>${table}<p>Sie können ausgewählte Einträge im System zur Auszahlung markieren.</p>`,
      };
    },
  },
  buttons: {
    goToSubmissions: {
      PL: 'Przejdź do nadgodzin',
      EN: 'Go to overtime',
      DE: 'Zu Überstunden',
    },
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a trilingual subject line: "PL | EN | DE"
 */
export function trilingualSubject(translations) {
  return `${translations.PL} | ${translations.EN} | ${translations.DE}`;
}

/**
 * Creates trilingual HTML content with stacked language sections
 * @param {Object} contentByLang - Object with PL, EN, DE keys containing HTML content
 * @param {string} [buttonUrl] - Optional URL for action button
 * @param {Object} [buttonText] - Optional button text with PL, EN, DE keys
 */
export function trilingualHtml(contentByLang, buttonUrl, buttonText) {
  const buttonStyle =
    'display:inline-block;padding:10px 20px;font-size:16px;color:white;background-color:#007bff;text-decoration:none;border-radius:5px;';

  const sections = ['PL', 'EN', 'DE']
    .map((lang) => {
      const buttonHtml =
        buttonUrl && buttonText
          ? `<p><a href="${escapeHtml(buttonUrl)}" style="${buttonStyle}">${buttonText[lang]}</a></p>`
          : '';

      return `
      <div style="margin-bottom:20px;border-left:4px solid ${LANG_COLORS[lang]};padding-left:15px;">
        <p style="color:${LANG_COLORS[lang]};font-weight:bold;margin:0 0 10px 0;">${lang}</p>
        ${contentByLang[lang]}
        ${buttonHtml}
      </div>`;
    })
    .join('');

  return `<div style="font-family:Arial,sans-serif;max-width:600px;">${sections}</div>`;
}
