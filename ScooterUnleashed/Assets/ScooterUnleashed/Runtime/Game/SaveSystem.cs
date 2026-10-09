using System;
using System.IO;
using ScooterUnleashed.Core.Save;
using ScooterUnleashed.Core.Stats;
using UnityEngine;

namespace ScooterUnleashed.Game
{
    /// <summary>JSON file storage with atomic writes and a backup copy, so a crash mid-save never corrupts progress.</summary>
    public sealed class FileSaveStorage : ISaveStorage
    {
        private readonly string _path;
        private string Backup => _path + ".bak";
        private string Temp => _path + ".tmp";

        public FileSaveStorage(string fileName = "scooter_unleashed_save.json")
        {
            _path = Path.Combine(Application.persistentDataPath, fileName);
        }

        public string FilePath => _path;

        public bool TryRead(out string json)
        {
            json = null;
            foreach (var p in new[] { _path, Backup })
            {
                try
                {
                    if (!File.Exists(p)) continue;
                    json = File.ReadAllText(p);
                    if (!string.IsNullOrWhiteSpace(json) && json.TrimStart().StartsWith("{")) return true;
                }
                catch (Exception e) { Debug.LogWarning($"[Save] Could not read {p}: {e.Message}"); }
            }
            return false;
        }

        public void Write(string json)
        {
            File.WriteAllText(Temp, json);
            if (File.Exists(_path)) File.Copy(_path, Backup, true);
            if (File.Exists(_path)) File.Delete(_path);
            File.Move(Temp, _path);
        }

        public void Delete()
        {
            foreach (var p in new[] { _path, Backup, Temp }) if (File.Exists(p)) File.Delete(p);
        }
    }

    public sealed class UnityJsonSerializer : IJsonSerializer
    {
        public string ToJson(object obj) => JsonUtility.ToJson(obj, false);
        public T FromJson<T>(string json) => JsonUtility.FromJson<T>(json);
    }

    public sealed class SaveSystem
    {
        private readonly ISaveStorage _storage;
        private readonly IJsonSerializer _json;
        private readonly PartCatalog _parts;

        public SaveData Data { get; private set; }
        public string LastError { get; private set; }
        public bool IsNewGame { get; private set; }

        public SaveSystem(ISaveStorage storage, IJsonSerializer json, PartCatalog parts)
        {
            _storage = storage;
            _json = json;
            _parts = parts;
        }

        public void Load()
        {
            LastError = null;
            IsNewGame = false;
            try
            {
                if (_storage.TryRead(out var json)) Data = _json.FromJson<SaveData>(json);
            }
            catch (Exception e)
            {
                LastError = "No se pudo leer la partida guardada: " + e.Message;
                Debug.LogWarning("[Save] " + LastError);
            }
            if (Data == null) { Data = new SaveData(); IsNewGame = true; }
            Data.Normalize(_parts);
        }

        public bool Save()
        {
            try
            {
                Data.LastSavedIso = DateTime.UtcNow.ToString("o");
                _storage.Write(_json.ToJson(Data));
                LastError = null;
                return true;
            }
            catch (Exception e)
            {
                LastError = "No se pudo guardar: " + e.Message;
                Debug.LogError("[Save] " + LastError);
                return false;
            }
        }

        public void ResetProgress()
        {
            var settings = Data?.Settings;
            _storage.Delete();
            Data = new SaveData();
            if (settings != null) Data.Settings = settings;
            Data.Normalize(_parts);
            Save();
        }
    }
}
