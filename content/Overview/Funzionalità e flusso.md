## Flusso del Dispositivo (ESP8266)

Il dispositivo, all'avvio, si connette al WiFi e al broker MQTT HiveMQ Cloud tramite TLS. Se è già stato configurato in precedenza, carica le impostazioni della pianta dalla memoria EEPROM e le applica subito, prima ancora di ricevere una risposta dal server.

Una volta online, ogni 10 secondi legge i sensori e pubblica i dati sul topic MQTT della pianta. Il server risponde con la configurazione aggiornata (range ottimali, nome) sul topic `/config`, che il dispositivo applica e salva in EEPROM.

I due LED segnalano lo stato in modo immediato: il verde si accende quando il dispositivo è online e tutti i parametri sono nel range ottimale, il rosso quando è offline o almeno un sensore è fuori range. Ogni 5 minuti, se i sensori sono fuori range, il dispositivo emette anche un avviso sonoro.

Il bottone fisico, quando premuto, pubblica un messaggio `BUTTON_PRESSED` sul topic MQTT, che il server interpreta come una nuova annaffiatura.

Il DFPlayer Mini gestisce la riproduzione audio: suoni di sistema all'avvio, alla connessione e alla disconnessione MQTT, e tracce musicali selezionabili dall'utente tramite la web app.

---
## Flusso della Web App

##### **Index**
Se l'utente è autenticato viene reindirizzato alla Dashboard, altrimenti vede i link a Login e Registrazione.
##### **Login / Registrazione**
La registrazione richiede nome, cognome, email e password. Il login usa email e password. Il completamento di entrambe le operazioni reindirizza alla Dashboard.
##### **Dashboard**
Mostra un saluto personalizzato con la data corrente e un riepilogo dello stato generale. Include la sezione "Attenzione richiesta" con le piante fuori range, le prossime annaffiature in formato card scorrevole, una selezione di piante e il feed delle attività recenti.
##### **Le mie piante**
Elenco di tutte le piante registrate con stato, ultimi valori e indicatore di connessione del dispositivo. Bottone per aggiungere una nuova pianta.
##### **Aggiunta pianta**
Form con nome, condizioni ottimali (da template predefinito o personalizzate), frequenza di annaffiatura e personalizzazione visiva del modello Live2D.
##### **Dettagli pianta**
Pagina principale per il monitoraggio. Contiene il modello Live2D interattivo, i valori dei sensori aggiornati in tempo reale, la data della prossima annaffiatura e una serie di azioni rapide tramite finestre modali: storico, note, modifica condizioni, collegamento dispositivo, scelta della musica.
##### **Impostazioni**
Modifica dei dati del profilo (nome, email, password), selezione del tema (chiaro/scuro) ed eliminazione dell'account con doppia conferma.