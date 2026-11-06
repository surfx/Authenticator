<template>
  <div class="permissions-page">
    <div class="show-all">
      <input
        type="checkbox"
        id="showRequiredPermission"
        v-model="showAllPermissions"
      />
      <label for="showRequiredPermission">{{
        i18n.permission_show_required_permissions
      }}</label>
    </div>
    <div
      class="permission"
      v-for="permission in permissions"
      :key="permission.id"
    >
      <h3>{{ permission.id }}</h3>
      <p>{{ permission.description }}</p>
      <p v-if="!permission.revocable">{{ i18n.permission_required }}</p>
      <a-button v-if="permission.revocable" @click="revoke(permission.id)">
        {{ i18n.permission_revoke }}
      </a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { Permission } from "../../models/permission";

export default Vue.extend({
  data: function () {
    return {
      showAllPermissions: false,
    };
  },
  computed: {
    permissions: function () {
      return this.$store.state.permissions.permissions.filter(
        (permission: Permission) => {
          return this.showAllPermissions || permission.revocable;
        }
      );
    },
  },
  methods: {
    revoke(permissionId: string) {
      this.$store.commit("permissions/revokePermission", permissionId);
    },
  },
});
</script>
