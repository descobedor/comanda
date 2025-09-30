import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { QRCodeCanvas } from "qrcode.react";
import { FaConciergeBell, FaFileInvoiceDollar, FaTimesCircle } from "react-icons/fa";
import "./App.css";

const API_URL = "https://signaling-server-z9az.onrender.com";
const WS_URL = "wss://signaling-server-z9az.onrender.com";
const APP_URL = "https://comanda-client.vercel.app";

function App() {
  const [tables, setTables] = useState([]);
  const [queue, setQueue] = useState([]);
  const [qrModal, setQrModal] = useState(null);
  const sockets = useRef({});


  const generateTable = async () => {
    const alias = prompt("Introduce un alias para la mesa:");
    if (!alias) return;

    if (tables.some((t) => t.alias.toLowerCase() === alias.toLowerCase())) {
      alert("Ya existe una mesa con ese alias.");
      return;
    }

    try {
      const { data } = await axios.get(`${API_URL}/new?alias=${encodeURIComponent(alias)}`);
      const { uuid, alias: confirmedAlias } = data;

      const newTable = { uuid, alias: confirmedAlias, history: [], hasPending: false };
      setTables((prev) => [...prev, newTable]);

      connectTo(newTable);
    } catch (err) {
      console.error("Error creando mesa:", err);
    }
  };

  const connectTo = (table) => {
    const socket = new WebSocket(`${WS_URL}/${table.uuid}?role=waiter`);
    sockets.current[table.uuid] = socket;

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      setTables((prev) =>
        prev.map((t) => {
          if (t.uuid !== table.uuid) return t;
          let updatedHistory = [...t.history];

          if (msg.type === "history") {
            updatedHistory = msg.data;

          } else if (msg.type === "message") {
            updatedHistory.push(msg.data);


            
            notify(table.alias, msg.data);

            // 👇 evitar duplicados en la cola
            setQueue((prev) => {
              if (prev.some((m) => m.id === msg.data.id)) return prev;
              return [...prev, { ...msg.data, alias: table.alias }];
            });

          } else if (msg.type === "confirmation" || msg.type === "cancellation") {
            updatedHistory = updatedHistory.map((m) =>
              m.id === msg.data.id
                ? { ...m, status: msg.data.status, reason: msg.data.reason }
                : m
            );
            setQueue((prev) =>
              prev.map((m) =>
                m.id === msg.data.id
                  ? { ...m, status: msg.data.status, reason: msg.data.reason }
                  : m
              )
            );
          }

          const hasPending = updatedHistory.some((m) => m.status === "pending");
          return { ...t, history: updatedHistory, hasPending };
        })
      );
    };
  };

  const confirmOrder = (uuid, id) => {
    sockets.current[uuid]?.send(JSON.stringify({ type: "confirmation", id }));
  };

  const cancelOrder = (uuid, id) => {
    sockets.current[uuid]?.send(JSON.stringify({ type: "cancellation", id }));
  };

  const closeTable = (uuid) => {
    if (sockets.current[uuid]) {
      sockets.current[uuid].send(JSON.stringify({ type: "closeTable" }));
      sockets.current[uuid].close();
      delete sockets.current[uuid];
    }
    const alias = tables.find((t) => t.uuid === uuid)?.alias;
    setTables((prev) => prev.filter((t) => t.uuid !== uuid));
    setQueue((prev) => prev.filter((m) => m.alias !== alias));
  };

  const notify = (alias, msg) => {
    const audio = new Audio("/ding.mp3");
    audio.play().catch(() => {});
    if (navigator.vibrate) navigator.vibrate(300);
    console.log(`🔔 Nueva orden en ${alias}: ${msg.action}`);
  };

  const renderIcon = (action, status) => {
    let icon;
    if (action === "service") icon = <FaConciergeBell size={24} />;
    if (action === "bill") icon = <FaFileInvoiceDollar size={24} />;
    if (action === "cancel") icon = <FaTimesCircle size={24} />;

    let color = "#333";
    if (status === "pending") color = "#ffc107";
    if (status === "confirmed") color = "#28a745";
    if (status === "cancelled") color = "#dc3545";

    let labelStatus = status;
if (status === "confirmed") labelStatus = "realizado";
if (status === "cancelled") labelStatus = "cancelado";

return (
  <span style={{ color, display: "flex", alignItems: "center", gap: "6px" }}>
    {icon}
    <span>{getLabel(action)} — {labelStatus}</span>
  </span>
);
  };

  const sortedTables = [...tables].sort((a, b) => {
    if (a.hasPending && !b.hasPending) return -1;
    if (!a.hasPending && b.hasPending) return 1;
    return 0;
  });

  const getLabel = (action) => {
  if (action === "service") return "Servicio del restaurante";
  if (action === "bill") return "Cuenta";
  if (action === "cancel") return "Cancelado";
  return "";
};

  return (
    <div className="app-container">
      
      <button className="new-btn" onClick={generateTable}>
        ➕ Abrir nueva mesa
      </button>

      <h2>Mesas</h2>
      {tables.length === 0 ? (
  <div className="empty-state">
    <p>🍽️ No hay mesas abiertas todavía</p>
    <button className="new-btn" onClick={generateTable}>
      Abrir mesa
    </button>
  </div>
) : (


      <div className="tables-container">
        {sortedTables.map((t) => (
          <div key={t.uuid} className={`table-card ${t.hasPending ? "pending" : ""}`}>
            <div className="card-header">
              <h3>
  {t.alias}
  {t.hasPending && <span className="badge">{t.history.filter(m => m.status === "pending").length}</span>}
</h3>
              <button className="lock-table-btn" onClick={() => closeTable(t.uuid)}>🔒</button>
            </div>

            <div className="qr-container" onClick={() => setQrModal(t.uuid)}>
              <QRCodeCanvas
                value={`${APP_URL}/join/${t.uuid}`}
                size={100}
                bgColor="#ffffff"
                fgColor="#000000"
                includeMargin={true}
              />
              <p>{`${APP_URL}/join/${t.uuid}`}</p>
            </div>

            {t.history.length > 0 && (
              <div className={`last-msg ${t.history[t.history.length - 1].status}`}>
                <span>
                  {renderIcon(
                    t.history[t.history.length - 1].action,
                    t.history[t.history.length - 1].status
                  )}
                </span>
                <div className="actions">
                {t.history[t.history.length - 1].status === "pending" ? (
  <button onClick={() => confirmOrder(t.uuid, t.history[t.history.length - 1].id)}>✅</button>
) : (
                  <b>{t.history[t.history.length - 1].status === "confirmed" ? "realizado" : t.history[t.history.length - 1].status}</b>
                )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    )}
      <h2>📋 Listado de acciones</h2>
      <ul className="queue-list">
  {[...queue].reverse().map((m) => (
    <li key={m.id} className={`queue-item ${m.status}`}>
  [{m.alias}] {renderIcon(m.action, m.status)}
</li>
  ))}
</ul>

      {qrModal && (
        <div className="qr-modal" onClick={() => setQrModal(null)}>
          <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Escanea este QR</h2>
            <QRCodeCanvas
              value={`${APP_URL}/join/${qrModal}`}
              size={300}
              bgColor="#ffffff"
              fgColor="#000000"
              includeMargin={true}
            />
            <p>{`${APP_URL}/join/${qrModal}`}</p>
            <button className="close-btn" onClick={() => setQrModal(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
