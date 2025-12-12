/**
 * Trilingual email translation utility (PL/EN/DE)
 */

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
  areas: {
    coating: { PL: 'powlekanie', EN: 'coating', DE: 'Beschichtung' },
  },
  buttons: {
    goToDeviation: { PL: 'Przejdź do odchylenia', EN: 'Go to deviation', DE: 'Zur Abweichung' },
  },
  subjects: {
    awaitingApproval: (id, roleKey) => {
      const role = DEVIATIONS.roles[roleKey] || { PL: roleKey, EN: roleKey, DE: roleKey };
      return {
        PL: `Odchylenie [${id}] - oczekuje na zatwierdzenie (${role.PL})`,
        EN: `Deviation [${id}] - awaiting approval (${role.EN})`,
        DE: `Abweichung [${id}] - wartet auf Genehmigung (${role.DE})`,
      };
    },
    vacancy: (id, roleKey) => {
      const role = DEVIATIONS.roles[roleKey] || { PL: roleKey, EN: roleKey, DE: roleKey };
      return {
        PL: `Odchylenie [${id}] - oczekuje na zatwierdzenie (wakat ${role.PL})`,
        EN: `Deviation [${id}] - awaiting approval (vacancy ${role.EN})`,
        DE: `Abweichung [${id}] - wartet auf Genehmigung (Vakanz ${role.DE})`,
      };
    },
    plantManagerFinal: (id) => ({
      PL: `Odchylenie [${id}] - oczekuje na zatwierdzenie (Dyrektor Zakładu)`,
      EN: `Deviation [${id}] - awaiting approval (Plant Manager)`,
      DE: `Abweichung [${id}] - wartet auf Genehmigung (Werksleiter)`,
    }),
  },
  messages: {
    awaitingRole: (id, roleKey) => {
      const role = DEVIATIONS.roles[roleKey] || { PL: roleKey, EN: roleKey, DE: roleKey };
      return {
        PL: `Odchylenie [${id}] oczekuje ponad 72h na zatwierdzenie w roli: ${role.PL}.`,
        EN: `Deviation [${id}] has been awaiting approval for over 72h in role: ${role.EN}.`,
        DE: `Abweichung [${id}] wartet seit über 72 Stunden auf Genehmigung in der Rolle: ${role.DE}.`,
      };
    },
    plantManagerFinal: (id) => ({
      PL: `Odchylenie [${id}] zostało zatwierdzone przez wszystkie inne stanowiska i czeka ponad 72h na zatwierdzenie przez Dyrektora Zakładu.`,
      EN: `Deviation [${id}] has been approved by all other positions and has been awaiting Plant Manager approval for over 72h.`,
      DE: `Abweichung [${id}] wurde von allen anderen Positionen genehmigt und wartet seit über 72 Stunden auf die Genehmigung des Werksleiters.`,
    }),
    vacancy: (id, roleKey, areaKey) => {
      const role = DEVIATIONS.roles[roleKey] || { PL: roleKey, EN: roleKey, DE: roleKey };
      const area = areaKey
        ? DEVIATIONS.areas[areaKey] || { PL: areaKey.toUpperCase(), EN: areaKey.toUpperCase(), DE: areaKey.toUpperCase() }
        : null;
      if (area) {
        return {
          PL: `Odchylenie [${id}] oczekuje ponad 72h na zatwierdzenie. Powiadomienie wysłano do Dyrektora Zakładu z powodu wakatu na stanowisku: ${role.PL} dla obszaru: ${area.PL}.`,
          EN: `Deviation [${id}] has been awaiting approval for over 72h. Notification sent to Plant Manager due to vacancy in position: ${role.EN} for area: ${area.EN}.`,
          DE: `Abweichung [${id}] wartet seit über 72 Stunden auf Genehmigung. Benachrichtigung an den Werksleiter wegen Vakanz in der Position: ${role.DE} für Bereich: ${area.DE}.`,
        };
      }
      return {
        PL: `Odchylenie [${id}] oczekuje ponad 72h na zatwierdzenie. Powiadomienie wysłano do Dyrektora Zakładu z powodu wakatu na stanowisku: ${role.PL}.`,
        EN: `Deviation [${id}] has been awaiting approval for over 72h. Notification sent to Plant Manager due to vacancy in position: ${role.EN}.`,
        DE: `Abweichung [${id}] wartet seit über 72 Stunden auf Genehmigung. Benachrichtigung an den Werksleiter wegen Vakanz in der Position: ${role.DE}.`,
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
    attendanceReminder: {
      PL: 'Zlecenia wykonania pracy w godzinach nadliczbowych - produkcja - oczekuje na dodanie listy obecności',
      EN: 'Production overtime work orders - awaiting attendance list',
      DE: 'Produktionsüberstundenaufträge - Anwesenheitsliste erforderlich',
    },
  },
  messages: {
    pendingCount: (count) => ({
      PL: `Masz ${count} ${count === 1 ? 'oczekujące zlecenie' : 'oczekujące zlecenia'} wykonania pracy w godzinach nadliczbowych - produkcja.`,
      EN: `You have ${count} pending production overtime work order${count === 1 ? '' : 's'}.`,
      DE: `Sie haben ${count} ausstehende${count === 1 ? 'n' : ''} Produktionsüberstundenauftrag${count === 1 ? '' : 'saufträge'}.`,
    }),
    attendanceCount: (count) => ({
      PL: `${count === 1 ? 'Zlecenie wykonania pracy w godzinach nadliczbowych - produkcja oczekuje' : `${count} zleceń wykonania pracy w godzinach nadliczbowych - produkcja oczekuje`} na dodanie listy obecności.`,
      EN: `${count} production overtime work order${count === 1 ? ' is' : 's are'} awaiting attendance list.`,
      DE: `${count} Produktionsüberstundenauftrag${count === 1 ? ' wartet' : 'saufträge warten'} auf Anwesenheitsliste.`,
    }),
  },
};

// ============================================================================
// HR TRAINING TRANSLATIONS
// ============================================================================

export const HR_TRAINING = {
  subjects: {
    evaluationReminder: (trainingName) => ({
      PL: `Przypomnienie HR: Ocena efektywności szkoleń - ${trainingName}`,
      EN: `HR Reminder: Training effectiveness evaluation - ${trainingName}`,
      DE: `HR-Erinnerung: Bewertung der Schulungseffektivität - ${trainingName}`,
    }),
  },
  messages: {
    greeting: (firstName) => ({
      PL: `Dzień dobry${firstName ? ` ${firstName}` : ''},`,
      EN: `Hello${firstName ? ` ${firstName}` : ''},`,
      DE: `Guten Tag${firstName ? ` ${firstName}` : ''},`,
    }),
    deadlineInfo: (formattedDate) => ({
      PL: `W dniu <strong>${formattedDate}</strong> mija termin wymaganego dokonania oceny efektywności zrealizowanych szkoleń w Twoim zespole.`,
      EN: `The deadline for completing the effectiveness evaluation of completed trainings in your team is <strong>${formattedDate}</strong>.`,
      DE: `Am <strong>${formattedDate}</strong> endet die Frist für die erforderliche Bewertung der Wirksamkeit der durchgeführten Schulungen in Ihrem Team.`,
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
          ? `<p><a href="${buttonUrl}" style="${buttonStyle}">${buttonText[lang]}</a></p>`
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

/**
 * Format area name for display in all languages
 */
export function formatArea(areaKey) {
  if (areaKey === 'coating') {
    return DEVIATIONS.areas.coating;
  }
  const upper = areaKey.toUpperCase();
  return { PL: upper, EN: upper, DE: upper };
}
