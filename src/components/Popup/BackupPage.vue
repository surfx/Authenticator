<template>
  <div>
    <!-- File Backup -->
    <div v-show="!exportDisabled">
      <div class="text warning" v-if="!defaultEncryption">
        {{ i18n.export_info }}
      </div>
      <div class="text">
        {{ i18n.backup_file_info }}
      </div>
      <div class="text warning" v-if="unsupportedAccounts">
        {{ i18n.otp_unsupported_warn }}
      </div>
      <div class="text warning" v-if="currentlyEncrypted">
        {{ i18n.phrase_incorrect_export }}
      </div>
      <div class="text">
        <label for="exportFormat">Formato:</label>
        <select id="exportFormat" v-model="exportFormat">
          <option value="csv">CSV (.csv)</option>
          <option value="txt" v-if="!unsupportedAccounts">
            otpauth (.txt)
          </option>
          <option value="json">JSON (.json)</option>
        </select>
      </div>
      <button v-on:click="downloadBackup()" class="button">
        {{ i18n.download_backup }}
      </button>
      <a-button-link
        download="authenticator.json"
        :href="exportEncryptedFile"
        v-if="!!defaultEncryption && isDataLinkSupported"
        >{{ i18n.download_enc_backup }}</a-button-link
      >
      <button
        v-on:click="downloadBackUpExportEncryptedFile()"
        v-if="!!defaultEncryption && !isDataLinkSupported"
        class="button"
      >
        {{ i18n.download_enc_backup }}
      </button>
    </div>
    <FileImport />
    <br />
    <!-- 3rd Party Backup Services -->
    <div v-show="!backupDisabled && isBackupServiceSupported">
      <div class="text">
        {{ i18n.storage_sync_info }}
      </div>
      <p></p>
      <a-button @click="showInfo('DrivePage')"> Google Drive </a-button>
      <a-button @click="showInfo('OneDrivePage')"> OneDrive </a-button>
      <a-button @click="showInfo('DropboxPage')"> Dropbox </a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isSafari } from "../../browser";
import { accountsToCsv } from "../../models/csv";
import FileImport from "../Import/FileImport.vue";

export default Vue.extend({
  components: { FileImport },
  data: function () {
    const exportData = this.$store.state.accounts.exportData;
    const exportEncData = this.$store.state.accounts.exportEncData;
    const key = this.$store.state.accounts.key;

    return {
      exportFormat: "csv",
      unsupportedAccounts: hasUnsupportedAccounts(exportData),
      exportEncryptedFile: getBackupFile(exportEncData, key),
    };
  },
  computed: {
    defaultEncryption: function () {
      return this.$store.state.accounts.defaultEncryption;
    },
    exportDisabled: function () {
      return this.$store.state.menu.exportDisabled;
    },
    currentlyEncrypted: function () {
      return this.$store.getters["accounts/currentlyEncrypted"];
    },
    backupDisabled: function () {
      return this.$store.state.menu.backupDisabled;
    },
    isDataLinkSupported: function () {
      return !isSafari;
    },
    isBackupServiceSupported: function () {
      return !isSafari;
    },
  },
  methods: {
    showInfo(tab: string) {
      if (tab === "DropboxPage") {
        chrome.permissions.request(
          { origins: ["https://*.dropboxapi.com/*"] },
          async (granted) => {
            if (granted) {
              this.$store.commit("style/showInfo");
              this.$store.commit("currentView/changeView", tab);
            }
          }
        );
        return;
      } else if (tab === "DrivePage") {
        chrome.permissions.request(
          {
            origins: [
              "https://www.googleapis.com/*",
              "https://accounts.google.com/o/oauth2/revoke",
            ],
          },
          async (granted) => {
            if (granted) {
              this.$store.commit("style/showInfo");
              this.$store.commit("currentView/changeView", tab);
            }
            return;
          }
        );
        return;
      } else if (tab === "OneDrivePage") {
        chrome.permissions.request(
          {
            origins: [
              "https://graph.microsoft.com/me/*",
              "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            ],
          },
          async (granted) => {
            if (granted) {
              this.$store.commit("style/showInfo");
              this.$store.commit("currentView/changeView", tab);
            }
            return;
          }
        );
        return;
      }
    },
    downloadBackup() {
      const exportData = this.$store.state.accounts.exportData;
      let url: string;
      if (this.exportFormat === "txt") {
        url = getOneLineOtpBackupFile(exportData);
      } else if (this.exportFormat === "json") {
        url = getBackupFile(exportData);
      } else {
        url = getCsvBackupFile(exportData);
      }
      if (isSafari) {
        window.open(url);
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `authenticator.${this.exportFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    downloadBackUpExportEncryptedFile() {
      const exportEncData = this.$store.state.accounts.exportEncData;
      const key = this.$store.state.accounts.key;
      const t = getBackupFile(exportEncData, key);
      window.open(t);
    },
  },
});

function hasUnsupportedAccounts(exportData: { [h: string]: RawOTPStorage }) {
  for (const entry of Object.keys(exportData)) {
    if (
      exportData[entry].type === "battle" ||
      exportData[entry].type === "steam"
    ) {
      return true;
    }
  }
  return false;
}

function getBackupFile(
  entryData: { [hash: string]: RawOTPStorage },
  key?: Object
) {
  if (key) {
    Object.assign(entryData, { key: key });
  }
  let json = JSON.stringify(entryData, null, 2);
  // for windows notepad
  json = json.replace(/\n/g, "\r\n");
  return downloadFileUrlBuilder(json);
}

function getCsvBackupFile(entryData: { [hash: string]: RawOTPStorage }) {
  const accounts = Object.keys(entryData)
    .map((hash) => entryData[hash])
    .sort((a, b) => a.index - b.index)
    .map((e) => ({
      issuer: e.issuer || "",
      account: e.account || "",
      secret: e.secret,
      type: e.type,
      period: e.period || 30,
      digits: e.digits || 6,
      algorithm: e.algorithm || "SHA1",
      counter: e.counter || 0,
    }));
  const blob = new Blob([accountsToCsv(accounts)], {
    type: "text/csv;charset=utf-8",
  });
  return URL.createObjectURL(blob);
}

function getOneLineOtpBackupFile(entryData: { [hash: string]: RawOTPStorage }) {
  const otpAuthLines: string[] = [];
  for (const hash of Object.keys(entryData)) {
    const otpStorage = { ...entryData[hash] };
    if (otpStorage.issuer) {
      otpStorage.issuer = removeUnsafeData(otpStorage.issuer);
    }
    if (otpStorage.account) {
      otpStorage.account = removeUnsafeData(otpStorage.account);
    }
    const label = otpStorage.issuer
      ? otpStorage.issuer + ":" + (otpStorage.account || "")
      : otpStorage.account || "";
    let type = "";
    if (otpStorage.type === "totp" || otpStorage.type === "hex") {
      type = "totp";
    } else if (otpStorage.type === "hotp" || otpStorage.type === "hhex") {
      type = "hotp";
    } else {
      continue;
    }

    const otpAuthLine =
      "otpauth://" +
      type +
      "/" +
      label +
      "?secret=" +
      otpStorage.secret +
      (otpStorage.issuer ? "&issuer=" + otpStorage.issuer : "") +
      (type === "hotp" ? "&counter=" + otpStorage.counter : "") +
      (type === "totp" && otpStorage.period
        ? "&period=" + otpStorage.period
        : "") +
      (otpStorage.digits ? "&digits=" + otpStorage.digits : "") +
      (otpStorage.algorithm ? "&algorithm=" + otpStorage.algorithm : "");

    otpAuthLines.push(otpAuthLine);
  }

  return downloadFileUrlBuilder(otpAuthLines.join("\r\n"));
}

function downloadFileUrlBuilder(content: string) {
  const blob = new Blob([content], { type: "application/octet-stream" });
  return URL.createObjectURL(blob);
}

function removeUnsafeData(data: string) {
  return encodeURIComponent(data.split("::")[0].replace(/:/g, ""));
}
</script>
