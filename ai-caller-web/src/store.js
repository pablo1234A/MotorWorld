// Almacén en un fichero JSON: suficiente para cientos de llamadas y sin dependencias nativas.
// Las escrituras se serializan y son atómicas (fichero temporal + rename) para no perder datos.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const EMPTY = () => ({ calls: {}, numbers: {}, control: { stopped: false, spentUsd: 0 } });

export class Store {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.data = { ...EMPTY(), ...JSON.parse(raw) };
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await this.save();
    }
    return this;
  }

  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, snapshot);
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }

  newId() {
    return crypto.randomUUID();
  }

  getCall(id) {
    return this.data.calls[id];
  }

  listCalls() {
    return Object.values(this.data.calls).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  findCallBySid(callSid) {
    return Object.values(this.data.calls).find((c) => c.twilioCallSid === callSid);
  }

  async putCall(call) {
    call.updatedAt = new Date().toISOString();
    this.data.calls[call.id] = call;
    await this.save();
    return call;
  }

  async updateCall(id, patch) {
    const call = this.data.calls[id];
    if (!call) return undefined;
    Object.assign(call, patch, { updatedAt: new Date().toISOString() });
    await this.save();
    return call;
  }

  // Añade una línea a la transcripción (se escribe a disco de inmediato: nada se pierde si el proceso cae).
  async appendTurn(id, role, text) {
    const call = this.data.calls[id];
    if (!call || !text?.trim()) return;
    call.transcript = call.transcript || [];
    call.transcript.push({ role, text: text.trim(), at: new Date().toISOString() });
    await this.updateCall(id, {});
  }

  getNumber(key) {
    return this.data.numbers[key];
  }

  async updateNumber(key, patch) {
    this.data.numbers[key] = { ...(this.data.numbers[key] || {}), ...patch };
    await this.save();
    return this.data.numbers[key];
  }

  get control() {
    return this.data.control;
  }

  async updateControl(patch) {
    Object.assign(this.data.control, patch);
    await this.save();
    return this.data.control;
  }
}
