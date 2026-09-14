/**
 * Resource Dice
 * Adds freeform "Resource Dice" tracks to D&D 5e character sheets.
 *
 * A resource die represents a depletable consumable (arrows, oil flasks, spell
 * components, ...). It has a current die step and can be rolled, stepped up, or
 * stepped down. When it drops below the smallest die it becomes depleted (0).
 *
 * Data is stored entirely on actor flags under this module's namespace, so the
 * dnd5e system is never modified.
 */

const MODULE_ID = "resource-dice";
const FLAG_KEY = "tracks";

/**
 * The ordered ladder of die steps, from largest to smallest, ending in a
 * "depleted" state (0). The index into this array is the die's current step.
 * @type {number[]}
 */
const DIE_LADDER = [20, 12, 10, 8, 6, 4, 0];

/**
 * Format a die faces value into its display / roll label.
 * @param {number} faces  Number of faces (0 means depleted).
 * @returns {string}
 */
function dieLabel(faces) {
  return faces > 0 ? `1d${faces}` : "0";
}

/* -------------------------------------------- */
/*  Data helpers                                */
/* -------------------------------------------- */

/**
 * Read the resource-dice tracks stored on an actor.
 *
 * Tracks are persisted as a keyed object ({ [id]: {label, faces} }) rather than
 * an array. Storing an array and later replacing it with a shorter array makes
 * Foundry's flag diffing emit legacy forced-deletion keys (the "-=..." warning).
 * A keyed object lets us delete a single entry cleanly with the modern
 * "-=<id>": null unset syntax.
 *
 * @param {Actor} actor
 * @returns {Array<{id: string, label: string, faces: number, sort: number}>}
 */
function getTracks(actor) {
  const stored = actor.getFlag(MODULE_ID, FLAG_KEY);

  let entries;
  if ( Array.isArray(stored) ) {
    // Legacy array shape.
    entries = stored.map((t, i) => [t.id ?? foundry.utils.randomID(), { ...t, sort: i }]);
  } else if ( stored && (foundry.utils.getType(stored) === "Object") ) {
    entries = Object.entries(stored);
  } else {
    return [];
  }

  return entries
    .map(([id, t], i) => ({
      id,
      label: typeof t?.label === "string" ? t.label : "",
      faces: DIE_LADDER.includes(t?.faces) ? t.faces : 6,
      sort: Number.isFinite(t?.sort) ? t.sort : i
    }))
    .sort((a, b) => a.sort - b.sort);
}

/**
 * Serialize an array of track objects into the stored keyed-object shape.
 * @param {Array<{id: string, label: string, faces: number, sort: number}>} tracks
 * @returns {Object<string, {label: string, faces: number, sort: number}>}
 */
function serializeTracks(tracks) {
  const out = {};
  tracks.forEach((t, i) => {
    out[t.id] = { label: t.label, faces: t.faces, sort: Number.isFinite(t.sort) ? t.sort : i };
  });
  return out;
}

/**
 * Persist the full set of tracks as a fresh keyed object.
 *
 * We always write the complete object (never a dotted sub-key), and if the
 * currently stored value is anything other than a plain object (e.g. a legacy
 * array), we first unset the flag. This prevents Foundry's update diff from
 * trying to merge an object into an array, which is what produced the
 * "-=[object Object]" forced-deletion warning.
 *
 * @param {Actor} actor
 * @param {Array} tracks
 * @returns {Promise<Actor>}
 */
async function writeTracks(actor, tracks) {
  const stored = actor.getFlag(MODULE_ID, FLAG_KEY);
  const isPlainObject = stored && (foundry.utils.getType(stored) === "Object");
  if ( stored !== undefined && !isPlainObject ) {
    // Clear a legacy / malformed value before writing the clean object.
    await actor.unsetFlag(MODULE_ID, FLAG_KEY);
  }
  return actor.setFlag(MODULE_ID, FLAG_KEY, serializeTracks(tracks));
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

/**
 * Add a new, empty resource die track to an actor.
 * @param {Actor} actor
 */
async function addTrack(actor) {
  const tracks = getTracks(actor);
  const sort = tracks.reduce((max, t) => Math.max(max, t.sort), -1) + 1;
  tracks.push({
    id: foundry.utils.randomID(),
    label: game.i18n.localize("RESOURCEDICE.NewResource"),
    faces: 6,
    sort
  });
  await writeTracks(actor, tracks);
}

/**
 * Remove a track by id.
 * @param {Actor} actor
 * @param {string} id
 */
async function deleteTrack(actor, id) {
  const tracks = getTracks(actor).filter(t => t.id !== id);
  await writeTracks(actor, tracks);
}

/**
 * Update the freeform label of a track.
 * @param {Actor} actor
 * @param {string} id
 * @param {string} label
 */
async function updateLabel(actor, id, label) {
  const tracks = getTracks(actor);
  const track = tracks.find(t => t.id === id);
  if ( !track || track.label === label ) return;
  track.label = label;
  await writeTracks(actor, tracks);
}

/**
 * Set a track's current die step directly (from the select input).
 * @param {Actor} actor
 * @param {string} id
 * @param {number} faces
 */
async function setDie(actor, id, faces) {
  if ( !DIE_LADDER.includes(faces) ) return;
  const tracks = getTracks(actor);
  const track = tracks.find(t => t.id === id);
  if ( !track || track.faces === faces ) return;
  track.faces = faces;
  await writeTracks(actor, tracks);
}

/**
 * Step a track's die up (+1, larger) or down (-1, smaller) along the ladder.
 * @param {Actor} actor
 * @param {string} id
 * @param {number} direction  +1 to increase die size, -1 to decrease.
 * @returns {Promise<number|undefined>}  The new faces value, if it changed.
 */
async function stepDie(actor, id, direction) {
  const tracks = getTracks(actor);
  const track = tracks.find(t => t.id === id);
  if ( !track ) return;
  const current = DIE_LADDER.indexOf(track.faces);
  // Larger die = lower index. "+" (increase) moves toward index 0.
  const next = Math.clamp(current - direction, 0, DIE_LADDER.length - 1);
  if ( next === current ) return;
  track.faces = DIE_LADDER[next];
  await writeTracks(actor, tracks);
  return track.faces;
}

/**
 * Roll a track's current die and post the result to chat.
 *
 * Uses the standard "resource die" mechanic: a result of 1 or 2 steps the die
 * down one size on the ladder (1d8 -> 1d6 -> ... -> 1d4 -> depleted).
 *
 * @param {Actor} actor
 * @param {string} id
 * @param {Event} [event]
 */
async function rollDie(actor, id, event) {
  const track = getTracks(actor).find(t => t.id === id);
  if ( !track ) return;
  if ( track.faces <= 0 ) {
    ui.notifications.warn(game.i18n.format("RESOURCEDICE.DepletedWarning", {
      label: track.label || game.i18n.localize("RESOURCEDICE.Resource")
    }));
    return;
  }

  const roll = await new Roll(`1d${track.faces}`).evaluate();
  const label = track.label || game.i18n.localize("RESOURCEDICE.Resource");
  let flavor = game.i18n.format("RESOURCEDICE.RollFlavor", {
    label,
    die: dieLabel(track.faces)
  });

  // Resource die depletion: rolling a 1 or 2 steps the die down.
  const stepsDown = roll.total <= 2;
  let newFaces;
  if ( stepsDown ) {
    newFaces = await stepDie(actor, id, -1);
    const suffix = (newFaces && newFaces > 0)
      ? game.i18n.format("RESOURCEDICE.SteppedDown", { die: dieLabel(newFaces) })
      : game.i18n.localize("RESOURCEDICE.Depleted");
    flavor += ` — ${suffix}`;
  }

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor
  }, { rollMode: game.settings.get("core", "rollMode") });

  return roll;
}

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

/**
 * Build the DOM for the Resources section.
 * @param {Actor} actor
 * @param {boolean} editable  Whether the sheet is currently editable.
 * @returns {HTMLElement}
 */
function buildSection(actor, editable) {
  const tracks = getTracks(actor);
  const isOwner = actor.isOwner;

  const section = document.createElement("div");
  section.classList.add("resource-dice", "meter-group");

  // Header row: title + add button.
  const header = document.createElement("div");
  header.classList.add("label", "roboto-condensed-upper", "resource-dice-header");

  const title = document.createElement("span");
  title.textContent = game.i18n.localize("RESOURCEDICE.Resources");
  header.appendChild(title);

  if ( isOwner ) {
    const add = document.createElement("button");
    add.type = "button";
    add.classList.add("unbutton", "resource-dice-add");
    add.dataset.rdAction = "add";
    add.dataset.tooltip = game.i18n.localize("RESOURCEDICE.AddResource");
    add.setAttribute("aria-label", game.i18n.localize("RESOURCEDICE.AddResource"));
    add.innerHTML = '<i class="fas fa-plus" inert></i>';
    header.appendChild(add);
  }
  section.appendChild(header);

  // Track list.
  const list = document.createElement("ul");
  list.classList.add("unlist", "resource-dice-list");

  for ( const track of tracks ) {
    list.appendChild(buildTrackRow(track, { editable, isOwner }));
  }

  if ( !tracks.length ) {
    const empty = document.createElement("li");
    empty.classList.add("resource-dice-empty");
    empty.textContent = game.i18n.localize("RESOURCEDICE.Empty");
    list.appendChild(empty);
  }

  section.appendChild(list);
  return section;
}

/**
 * Build a single track row element.
 * @param {{id: string, label: string, faces: number}} track
 * @param {{editable: boolean, isOwner: boolean}} options
 * @returns {HTMLElement}
 */
function buildTrackRow(track, { editable, isOwner }) {
  const li = document.createElement("li");
  li.classList.add("resource-dice-track");
  li.dataset.trackId = track.id;
  if ( track.faces <= 0 ) li.classList.add("depleted");

  /* --- Label --- */
  if ( isOwner ) {
    const label = document.createElement("input");
    label.type = "text";
    label.classList.add("uninput", "resource-dice-label");
    label.value = track.label;
    label.placeholder = game.i18n.localize("RESOURCEDICE.LabelPlaceholder");
    label.dataset.rdAction = "label";
    li.appendChild(label);
  } else {
    const label = document.createElement("span");
    label.classList.add("resource-dice-label");
    label.textContent = track.label || game.i18n.localize("RESOURCEDICE.Resource");
    li.appendChild(label);
  }

  /* --- Controls --- */
  const controls = document.createElement("div");
  controls.classList.add("resource-dice-controls");

  if ( isOwner ) {
    // Decrease step (smaller die).
    const minus = document.createElement("button");
    minus.type = "button";
    minus.classList.add("unbutton", "resource-dice-step");
    minus.dataset.rdAction = "step-down";
    minus.dataset.tooltip = game.i18n.localize("RESOURCEDICE.StepDown");
    minus.setAttribute("aria-label", game.i18n.localize("RESOURCEDICE.StepDown"));
    minus.innerHTML = '<i class="fas fa-minus" inert></i>';
    controls.appendChild(minus);

    // Die selector.
    const select = document.createElement("select");
    select.classList.add("resource-dice-select");
    select.dataset.rdAction = "select";
    select.setAttribute("aria-label", game.i18n.localize("RESOURCEDICE.CurrentDie"));
    for ( const faces of DIE_LADDER ) {
      const opt = document.createElement("option");
      opt.value = String(faces);
      opt.textContent = dieLabel(faces);
      if ( faces === track.faces ) opt.selected = true;
      select.appendChild(opt);
    }
    controls.appendChild(select);

    // Increase step (larger die).
    const plus = document.createElement("button");
    plus.type = "button";
    plus.classList.add("unbutton", "resource-dice-step");
    plus.dataset.rdAction = "step-up";
    plus.dataset.tooltip = game.i18n.localize("RESOURCEDICE.StepUp");
    plus.setAttribute("aria-label", game.i18n.localize("RESOURCEDICE.StepUp"));
    plus.innerHTML = '<i class="fas fa-plus" inert></i>';
    controls.appendChild(plus);

    // Roll button.
    const roll = document.createElement("button");
    roll.type = "button";
    roll.classList.add("unbutton", "resource-dice-roll");
    roll.dataset.rdAction = "roll";
    roll.dataset.tooltip = game.i18n.localize("RESOURCEDICE.Roll");
    roll.setAttribute("aria-label", game.i18n.localize("RESOURCEDICE.Roll"));
    roll.innerHTML = '<i class="fas fa-dice-d20" inert></i>';
    if ( track.faces <= 0 ) roll.disabled = true;
    controls.appendChild(roll);

    // Delete button.
    const del = document.createElement("button");
    del.type = "button";
    del.classList.add("unbutton", "resource-dice-delete");
    del.dataset.rdAction = "delete";
    del.dataset.tooltip = game.i18n.localize("RESOURCEDICE.Delete");
    del.setAttribute("aria-label", game.i18n.localize("RESOURCEDICE.Delete"));
    del.innerHTML = '<i class="fas fa-trash" inert></i>';
    controls.appendChild(del);
  } else {
    // Read-only: show current die and allow rolling.
    const roll = document.createElement("button");
    roll.type = "button";
    roll.classList.add("unbutton", "resource-dice-roll");
    roll.dataset.rdAction = "roll";
    roll.dataset.tooltip = game.i18n.localize("RESOURCEDICE.Roll");
    roll.setAttribute("aria-label", game.i18n.localize("RESOURCEDICE.Roll"));
    roll.innerHTML = `<span class="resource-dice-current">${dieLabel(track.faces)}</span>`;
    if ( track.faces <= 0 ) roll.disabled = true;
    controls.appendChild(roll);
  }

  li.appendChild(controls);
  return li;
}

/* -------------------------------------------- */
/*  Event wiring                                */
/* -------------------------------------------- */

/**
 * Attach delegated event listeners to a rendered Resources section.
 * @param {HTMLElement} section
 * @param {Actor} actor
 */
function activateListeners(section, actor) {
  if ( !actor.isOwner ) {
    // Non-owners can still roll.
    section.addEventListener("click", event => {
      const button = event.target.closest("[data-rd-action='roll']");
      if ( !button ) return;
      const id = button.closest(".resource-dice-track")?.dataset.trackId;
      if ( id ) rollDie(actor, id, event);
    });
    return;
  }

  // Click handling for buttons.
  section.addEventListener("click", event => {
    const button = event.target.closest("button[data-rd-action]");
    if ( !button ) return;
    const action = button.dataset.rdAction;
    const row = button.closest(".resource-dice-track");
    const id = row?.dataset.trackId;

    switch ( action ) {
      case "add":
        addTrack(actor);
        break;
      case "delete":
        if ( id ) deleteTrack(actor, id);
        break;
      case "roll":
        if ( id ) rollDie(actor, id, event);
        break;
      case "step-up":
        if ( id ) stepDie(actor, id, +1);
        break;
      case "step-down":
        if ( id ) stepDie(actor, id, -1);
        break;
    }
  });

  // Die selector change.
  section.addEventListener("change", event => {
    const select = event.target.closest("select[data-rd-action='select']");
    if ( select ) {
      const id = select.closest(".resource-dice-track")?.dataset.trackId;
      if ( id ) setDie(actor, id, Number(select.value));
      return;
    }
  });

  // Label commit on blur / enter.
  section.addEventListener("change", event => {
    const input = event.target.closest("input[data-rd-action='label']");
    if ( !input ) return;
    const id = input.closest(".resource-dice-track")?.dataset.trackId;
    if ( id ) updateLabel(actor, id, input.value.trim());
  });
}

/* -------------------------------------------- */
/*  Sheet injection                             */
/* -------------------------------------------- */

/**
 * Inject the Resources section into a rendered character sheet.
 * @param {Application} app   The sheet application instance.
 * @param {HTMLElement} html  The sheet's root element.
 */
function onRenderCharacterSheet(app, html) {
  const actor = app.document ?? app.actor;
  if ( !actor || actor.type !== "character" ) return;

  // Root element can be an HTMLElement (AppV2) or jQuery (AppV1). Normalize.
  const root = html instanceof HTMLElement ? html : html?.[0];
  if ( !root ) return;

  // Avoid duplicate injection on re-render.
  root.querySelector(".resource-dice")?.remove();

  // Preferred anchor: inside the sidebar stats card, after Hit Dice.
  const stats = root.querySelector(".sidebar .card .stats");
  const editable = app.isEditable ?? false;
  const section = buildSection(actor, editable);

  if ( stats ) {
    stats.appendChild(section);
  } else {
    // Fallback: append to sidebar or the sheet body if the layout differs.
    const anchor = root.querySelector(".sidebar") ?? root.querySelector(".sheet-body") ?? root;
    anchor.appendChild(section);
  }

  activateListeners(section, actor);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Resource Dice`);
});

// dnd5e 6.x character sheet is an ApplicationV2 named "CharacterActorSheet".
Hooks.on("renderCharacterActorSheet", onRenderCharacterSheet);

// Safety net for other/derived character sheet applications (AppV2 & AppV1).
Hooks.on("renderActorSheetV2", (app, html) => {
  if ( app?.document?.type === "character" ) onRenderCharacterSheet(app, html);
});
Hooks.on("renderActorSheet5eCharacter2", onRenderCharacterSheet);
