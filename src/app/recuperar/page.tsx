"use client";
import { useState } from "react";
export default function Recover() {
  const [message, setMessage] = useState("");
  return (
    <main className="auth-page">
      <h1>Nova palavra-passe</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const response = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "password",
              password: data.get("password"),
            }),
          });
          const result = await response.json();
          setMessage(result.message || result.error);
        }}
      >
        <label>
          Palavra-passe (mínimo 12 caracteres)
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <button type="submit">Guardar palavra-passe</button>
        <p role="status">{message}</p>
      </form>
      <a href="/">Voltar ao BoraMatch</a>
    </main>
  );
}
