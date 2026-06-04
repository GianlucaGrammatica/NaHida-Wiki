# Live2D: PlantViewer
`resources/js/live2d/live2d-viewer.js` `resources/js/live2d/live2d-start.js`

Per la teoria su Live2D Cubism, i parametri del modello e il significato degli stati vedi [[Modello Live2D]]. Questa pagina documenta l'implementazione tecnica del viewer: la struttura del modulo, l'inizializzazione, i parametri manipolati a runtime e le funzioni dell'API pubblica.

---
## Struttura: Singleton IIFE

```javascript
export const PlantViewer = (() => {
    // stato privato
    let _model = null;
    let _app   = null;
    // ...

    // funzioni private
    function _tickParams() { ... }
    function _updateExpression() { ... }

    // API pubblica
    return { init, setAppearance, randomizeAppearance, setState,
             tap, setPasswordMode, capturePreview, playWatering };
})();
```

`PlantViewer` è un Singleton implementato come IIFE (Immediately Invoked Function Expression). Tutte le variabili di stato e le funzioni private sono chiuse nello scope della funzione, inaccessibili dall'esterno. Il `return` alla fine espone solo le funzioni che il resto dell'applicazione deve usare.

Questa struttura garantisce che esista una sola istanza del viewer per pagina e che lo stato interno non possa essere modificato accidentalmente da altri script.

---
## Costanti e stato interno

```javascript
const MODEL_PATH = '/live2d/models/NaHida Plant Model/NaHida Plant Model.model3.json';

const PARAMS = {
    POT_COLOR:     'Pot_Color',
    PLANT_VARIANT: 'PlantVariant',
    PLANT_COLOR:   'PlantColor',
    FLOWER_COLOR:  'FlowerColor',
    SAD_PLANT:     'SadPlant',
    SAD_PLANT_COLOR: 'SadPlantColor',
    EYE_OPEN_R:    'EyeOpenR',
    EYE_OPEN_L:    'EyeOpenL',
    CLOSED_EYES:   'ClosedEyes',
    EYE_POS_X:     'EyePositionX',
    EYE_POS_Y:     'EyePositionY',
    PLANT_X:       'PlantX',
    PLANT_Y:       'PlantY2',
    PLANT_Z:       'PlantZ2',
};

let _state = {
    sleeping:    false,
    sad:         false,
    mid:         false,
    passwordMode: false,
    appearance:  { pot_color: 0, plant_variant: 0, plant_color: 0, flower_color: 0 },
    health:      { sad_plant: 0, sad_plant_color: 0 },
};
```

`PARAMS` mappa nomi leggibili agli ID stringa usati dall'SDK Cubism internamente. Avere un dizionario centrale evita di scrivere le stringhe literal sparse nel codice e rende più facile aggiornare i nomi se il modello viene modificato.

`_state` è l'unica fonte di verità sullo stato visivo corrente. `_tickParams()` legge da `_state` ad ogni frame e scrive i valori sui parametri del modello.

---
## `init()`

```javascript
async function init(canvasId = 'live2d-canvas') {
    const Live2DModel = window.PIXI?.live2d?.Live2DModel;
    _MotionPriority = window.PIXI.live2d?.MotionPriority;

    const canvas    = document.getElementById(canvasId);
    const container = canvas.parentElement;
    const W = container.clientWidth  || 400;
    const H = container.clientHeight || 500;

    _app = new window.PIXI.Application({
        view:       canvas,
        width:      W,
        height:     H,
        transparent: true,
        antialias:   true,
        resolution:  window.devicePixelRatio || 1,
        autoDensity: true,
        preserveDrawingBuffer: true,
    });

    _model = await Live2DModel.from(MODEL_PATH);
    _app.stage.addChild(_model);
    _fitModel(W, H);

    // Override del motion manager per gli stati
    const motionManager    = _model.internalModel.motionManager;
    const originalStartMotion = motionManager.startMotion;
    motionManager.startMotion = function (group, index, priority) {
        if (priority === _MotionPriority.IDLE) {
            group = _state.sleeping ? 'Sleep' : 'Idle';
        }
        return originalStartMotion.call(this, group, index, priority);
    };

    _model.motion('Idle', 0, _MotionPriority.FORCE);
    _updateExpression();

    canvas.addEventListener('pointerdown', () => tap());
    window.addEventListener('mousemove', (e) => {
        _targetMouseX = (e.clientX / window.innerWidth)  * 2 - 1;
        _targetMouseY = ((e.clientY / window.innerHeight) * 2 - 1) * -1;
    });

    _app.ticker.add(_tickParams);

    // rivela il canvas nascondendo lo skeleton
    const skeletonEl = document.getElementById('model-skeleton');
    if (skeletonEl) skeletonEl.style.display = 'none';
    canvas.classList.remove('opacity-0');
}
```

`preserveDrawingBuffer: true` è necessario per `capturePreview()`: senza questa opzione il buffer WebGL viene cancellato dopo ogni frame e `toDataURL()` restituirebbe un canvas vuoto.

`resolution: window.devicePixelRatio` scala il rendering per i display ad alta densità (Retina): senza questa opzione il modello apparirebbe sfocato su schermi 2x.

L'override di `motionManager.startMotion` intercetta le motion idle automatiche dell'SDK: quando il modello torna in idle da solo (dopo aver completato un tap o un watering), il gruppo scelto dipende dallo stato corrente. Senza questo override il modello passerebbe sempre alla motion `Idle` anche se la pianta dovrebbe dormire.

Il canvas parte con classe `opacity-0` e viene reso visibile solo dopo che `init()` completa con successo: evita di mostrare un frame bianco o parzialmente caricato durante l'inizializzazione dell'SDK.

---
## `_tickParams()` - aggiornamento parametri per frame

```javascript
function _tickParams() {
    if (!_model) return;
    const core = _model.internalModel.coreModel;
    const ids  = core._parameterIds;
    const vals = core._parameterValues;
    if (!ids || !ids.length) return;

    _currentMouseX += (_targetMouseX - _currentMouseX) * 0.1;
    _currentMouseY += (_targetMouseY - _currentMouseY) * 0.1;

    let outputX = (_state.passwordMode || _state.sleeping) ? 0 : _currentMouseX;
    let outputY = (_state.passwordMode || _state.sleeping) ? 0 : _currentMouseY;

    _setParam(ids, vals, PARAMS.POT_COLOR,       _state.appearance.pot_color);
    _setParam(ids, vals, PARAMS.PLANT_VARIANT,    _state.appearance.plant_variant);
    _setParam(ids, vals, PARAMS.PLANT_COLOR,      _state.appearance.plant_color);
    _setParam(ids, vals, PARAMS.FLOWER_COLOR,     _state.appearance.flower_color);
    _setParam(ids, vals, PARAMS.SAD_PLANT,        _state.health.sad_plant);
    _setParam(ids, vals, PARAMS.SAD_PLANT_COLOR,  _state.health.sad_plant_color);

    _setParam(ids, vals, PARAMS.EYE_POS_X,  outputX + outputX * 0.5);
    _setParam(ids, vals, PARAMS.EYE_POS_Y,  outputY + outputY * 0.5);
    _setParam(ids, vals, PARAMS.PLANT_X,    outputX + outputX * 1.1);
    _setParam(ids, vals, PARAMS.PLANT_Y,    outputY + outputY * 3);
    _setParam(ids, vals, PARAMS.PLANT_Z,    outputX + outputX * 2.5);

    if (!_state.sleeping && !_isTapping && !_state.passwordMode) {
        _tickBlink();
        _currentEyeBlink += (_targetEyeBlink - _currentEyeBlink) * 0.35;
        _setParam(ids, vals, PARAMS.EYE_OPEN_L, _currentEyeBlink);
        _setParam(ids, vals, PARAMS.EYE_OPEN_R, _currentEyeBlink);
    }

    if (!_isTapping) {
        _setParam(ids, vals, PARAMS.CLOSED_EYES, _state.sleeping ? 0 : 1);
    }
}

function _setParam(ids, vals, paramId, value) {
    const idx = ids.indexOf(paramId);
    if (idx !== -1) vals[idx] = value;
}
```

`_tickParams` viene aggiunta al ticker PIXI con `_app.ticker.add(_tickParams)`: viene eseguita ad ogni frame del rendering loop (tipicamente 60fps).

L'accesso diretto a `core._parameterIds` e `core._parameterValues` bypassa l'API pubblica dell'SDK per scrivere i valori direttamente negli array interni del modello. Questo è più performante che chiamare `setParameterValueById()` per ogni parametro ad ogni frame.

`_setParam` cerca l'indice del parametro per nome nell'array `ids` e scrive il valore nella posizione corrispondente in `vals`. Se il parametro non esiste nel modello, `indexOf` restituisce -1 e la scrittura viene saltata silenziosamente.

Il mouse tracking usa una **interpolazione lineare** (`lerp`) con fattore 0.1: invece di spostare la posizione degli occhi direttamente al valore del mouse, si avvicina del 10% ad ogni frame. Il risultato è un movimento fluido e smorzato invece di uno scatto immediato.

I moltiplicatori diversi per X e Y sui vari parametri (`outputX * 1.1`, `outputY * 3`) creano un effetto di parallasse: le diverse parti del modello si muovono a velocità diverse, simulando la profondità tridimensionale.

Il blink è gestito da `_tickBlink()`:

```javascript
function _tickBlink() {
    const now = performance.now();
    if (now > _nextBlinkTime) {
        _targetEyeBlink = 0;
        setTimeout(() => { _targetEyeBlink = 1; }, 100);
        _nextBlinkTime = now + 2000 + Math.random() * 4000;
    }
}
```

`_targetEyeBlink` viene impostato a 0 (occhi chiusi) e poi a 1 (occhi aperti) dopo 100ms. La lerp in `_tickParams` crea la transizione morbida. Il prossimo blink avviene dopo un intervallo casuale tra 2 e 6 secondi.

---
## `setState()` e `_updateExpression()`

```javascript
function setState(state) {
    const sleeping = state === 'sleep';
    const sad      = state === 'sad';
    const mid      = state === 'mid';

    if (_state.sleeping !== sleeping) {
        _state.sleeping = sleeping;
        _isTapping = false;
        if (_model) {
            _model.motion(sleeping ? 'Sleep' : 'Idle', 0, _MotionPriority.FORCE);
        }
    }

    _state.sad = sad;
    _state.mid = mid;
    _state.health.sad_plant       = sad ? 1 : (mid ? 0.5 : 0);
    _state.health.sad_plant_color = _state.health.sad_plant;

    _updateExpression();
}

function _updateExpression() {
    if (!_model) return;
    if      (_state.passwordMode) _model.expression('Password');
    else if (_state.sleeping)     _model.expression('Sleep');
    else if (_state.sad)          _model.expression('Sad');
    else if (_state.mid)          _model.expression('Mid');
    else                          _model.expression('Normal');
}
```

`setState()` aggiorna `_state` e attiva la motion solo se lo stato sleeping cambia: evita di interrompere una motion in corso ogni volta che arriva una lettura aggiornata con lo stesso stato.

`_state.health.sad_plant` viene impostato a `0`, `0.5` o `1` in base allo stato: questo valore viene scritto sul parametro `SadPlant` del modello ad ogni frame da `_tickParams`, controllando visivamente il grado di "appassimento" della pianta in modo continuo.

`_updateExpression()` ha priorità decrescente: `passwordMode` sovrascrive tutto, poi `sleeping`, poi `sad`, poi `mid`, poi il default `Normal`. Questo garantisce che la modalità password funzioni indipendentemente dallo stato di salute della pianta.

---
## `tap()`

```javascript
function tap() {
    if (!_model || _isTapping) return;

    const normalStates = [0, 1, 4];
    const sadStates    = [2, 5];
    const midStates    = [6];
    const sleepStates  = [3];

    _isTapping = true;
    let index = 0;

    if (_state.sleeping)   index = sleepStates[Math.floor(Math.random() * sleepStates.length)];
    else if (_state.sad)   index = sadStates[Math.floor(Math.random() * sadStates.length)];
    else if (_state.mid)   index = midStates[Math.floor(Math.random() * midStates.length)];
    else                   index = normalStates[Math.floor(Math.random() * normalStates.length)];

    _model.motion('Tap', index, _MotionPriority.FORCE)
        .finally(() => { _isTapping = false; });
}
```

Le motion di tap sono organizzate per stato: la pianta reagisce in modo diverso al tocco a seconda che sia felice, triste, in dormiveglia o in difficoltà. Gli indici corrispondono alle motion `Tap/0`, `Tap/1`, ecc. definite nel file `.model3.json`.

`_isTapping = true` durante la riproduzione impedisce che tap ravvicinati si sovrappongano. Il `.finally()` sulla Promise della motion resetta il flag quando la motion termina, anche in caso di interruzione.

---
## `capturePreview()`

```javascript
async function capturePreview(plantId, appearance = null) {
    if (appearance) setAppearance(appearance);
    if (!_model || !_app) return null;

    // Ferma il ticker
    _app.ticker.remove(_tickParams);

    // Forza stato neutrale
    _targetMouseX = 0; _targetMouseY = 0;
    _currentMouseX = 0; _currentMouseY = 0;
    _state.sleeping = false; _state.sad = false;
    _model.expression('Normal');
    // ... scrive parametri neutri direttamente ...

    // Attende due frame per il rendering
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Cattura dal canvas a risoluzione fissa 512x512
    const SIZE = 512;
    const destCanvas = document.createElement('canvas');
    destCanvas.width = SIZE; destCanvas.height = SIZE;
    const ctx = destCanvas.getContext('2d');
    // ... disegna con scaling centrato ...
    const dataURL = destCanvas.toDataURL('image/png');

    // Invia al server
    await fetch(`/api/plants/${plantId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': ... },
        body: JSON.stringify({ image: dataURL }),
    });

    // Ripristina stato precedente e riavvia ticker
    // ...
    _app.ticker.add(_tickParams);
    return url;
}
```

`capturePreview()` deve fermare il ticker (`_app.ticker.remove`) perché altrimenti `_tickParams` sovrascrive immediatamente i parametri neutri che sta cercando di impostare per lo screenshot. Dopo la cattura il ticker viene riavviato e tutto lo stato viene ripristinato.

`await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))` attende due frame invece di uno: il primo frame applica i nuovi parametri al modello, il secondo li renderizza effettivamente sul canvas WebGL.

La cattura crea un canvas temporaneo `512x512` e vi copia il canvas live scalando proporzionalmente: questo produce un'immagine di dimensione fissa indipendentemente dalla dimensione del canvas nell'interfaccia.

---
# `live2d-start.js`

```javascript
import { PlantViewer } from "./live2d-viewer.js";

window.addEventListener('DOMContentLoaded', async () => {
    await PlantViewer.init('live2d-canvas');

    if (window.PLANT_APPEARANCE)
        PlantViewer.setAppearance(window.PLANT_APPEARANCE);
    else
        PlantViewer.randomizeAppearance();
});
```

`live2d-start.js` è il punto di ingresso che avvia il viewer su ogni pagina che include il canvas. Legge `window.PLANT_APPEARANCE` iniettato dal Blade: se la pianta ha un aspetto salvato lo applica, altrimenti genera una combinazione casuale di variante e colore fiore.

`randomizeAppearance()` modifica solo `plant_variant` e `flower_color`, lasciando `pot_color` e `plant_color` a 0: è una scelta per limitare la casualità ai parametri visivamente più impattanti.