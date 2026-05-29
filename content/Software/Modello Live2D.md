## Cos'è Live2D e Cubism
Per rendere l'interfaccia utente più dinamica e interattiva, nel progetto è stata integrata la tecnologia **Live2D Cubism**.

A differenza della computer grafica in 3D, che richiede la creazione di modelli poligonali complessi e pesanti da caricare su un browser, Live2D permette di prendere un'illustrazione bidimensionale (divisa nei suoi vari livelli, come foglie, occhi, vaso) e di applicarle delle deformazioni geometriche controllate da parametri matematici. Il risultato è un'animazione fluida che simula la tridimensionalità, mantenendo però intatta la qualità e lo stile del disegno originale in 2D.

**Cubism** è l'SDK ufficiale che fornisce le librerie matematiche e i runtime per interpretare questi modelli (composti da file JSON di configurazione e texture PNG) direttamente all'interno di un'applicazione o di una pagina web sfruttando la potenza della scheda grafica tramite WebGL.

![[NaHida_Live2D.png]]

---
## Integrazione Tecnica nel Progetto
L'integrazione del modello all'interno della web app (Laravel + frontend in JavaScript) è stata centralizzata in un modulo JS dedicato (`PlantViewer`), sviluppato seguendo il pattern _Singleton_. Questa scelta permette di isolare completamente la logica di gestione del modello, esponendo verso l'esterno solo le funzioni strettamente necessarie.

L'architettura dell'integrazione si articola in tre punti chiave:

1. **Il Canvas HTML5:** Sia nella pagina di visualizzazione della pianta (`show.blade.php`) sia nella pagina di Login (`login.blade.php`), è presente un elemento `<canvas>` con ID `live2d-canvas`. Questo elemento fa da "lavagna" su cui il motore grafico (basato su WebGL e integrato con un ciclo di rendering continuo tramite un _ticker_) disegna il modello in tempo reale.
    
2. **Passaggio dati da Laravel a JavaScript:** Per accoppiare i dati salvati nel database MySQL con l'aspetto del modello, i file Blade di Laravel iniettano le variabili nel contesto globale della pagina sotto forma di oggetti Window (es. `window.PLANT_APPEARANCE` o `window.PLANT_HEALTH`). Al caricamento della pagina, lo script `live2d-start.js` legge queste configurazioni e istruisce il visualizzatore su come mostrare la pianta.
    
3. **Disaccoppiamento del rendering:** Poiché il caricamento dei file di un modello Live2D richiede qualche istante, nell'interfaccia è stato inserito uno _skeleton_ di caricamento gestito da DaisyUI. Non appena l'SDK termina l'inizializzazione del modello, il canvas passa in modo fluido da trasparente a visibile tramite una transizione CSS, evitando sgradevoli scatti grafici.

---
## Stati e Comportamenti del Modello
La caratteristica fondamentale di questa implementazione è che il modello Live2D è un vero e proprio specchio dello stato del dispositivo IoT e dell'interazione dell'utente. I comportamenti sono gestiti manipolando direttamente i parametri interni del modello (`setParameterValueById`) o attivando delle animazioni (_motions_).

#### 1. Personalizzazione dell'Aspetto (Genetica della Pianta)
Il modello supporta una serie di parametri parametrici che modificano la struttura visiva del render. Tramite la funzione `setAppearance()`, l'applicazione mappa i dati di personalizzazione della pianta sui parametri di Cubism:
- `Pot_Color`: Cambia il colore del vaso.
- `PlantVariant` e `PlantColor`: Modificano il tipo di pianta e la tonalità delle foglie.
- `FlowerColor`: Gestisce la presenza e il colore dei fiori sbocciati.
Se l'utente non ha ancora personalizzato la pianta, il sistema invoca `randomizeAppearance()`, che genera una combinazione casuale di questi parametri.
#### 2. Feedback dello Stato di Salute (Dati IoT)
Il comportamento emotivo del modello è direttamente collegato alle letture dei sensori hardware (temperatura, luce, umidità aria e suolo). Nella dashboard, un algoritmo analizza se i valori correnti rientrano nei range ottimali impostati dall'utente. Se i sensori rilevano anomalie (es. terreno troppo secco o temperatura fuori limite), il JavaScript aggiorna lo stato interno impostando il parametro `SadPlant` e modificando il `SadPlantColor`. La pianta cambierà espressione visiva, mostrando un aspetto appassito o triste, fornendo un feedback immediato anche senza leggere i numeri dei grafici.
#### 3. Modalità Password (Interazione contestuale)
Un dettaglio d'interazione avanzato è stato inserito nella pagina di Login e Registrazione. Sfruttando i listener sui campi di input del modulo HTML, il sistema intercetta quando l'utente clicca sul campo della password (`focus`) o quando si sposta altrove (`blur`):
- Quando l'utente seleziona il campo password, viene attivata la funzione `PlantViewer.setPasswordMode(true)`. Il modello Live2D reagisce chiudendo gli occhi o coprendosi il volto (attivando il parametro `ClosedEyes` o modificando la direzione dello sguardo), simulando l'atto di "non guardare" la chiave segreta che si sta digitando.
#### 4. Animazione di Annaffiatura (Motions)
Quando l'utente esegue un'azione rapida dall'interfaccia web o preme il pulsante fisico sul dispositivo ESP8266, il server invia una notifica in tempo reale al frontend. Questo trigger attiva la funzione `playWatering()`, che forza l'esecuzione della motion `Watering` memorizzata nel file del modello, mostrando l'animazione della pianta che riceve l'acqua.

![[NaHida_Picture_4.png]]