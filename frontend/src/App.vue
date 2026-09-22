<template>
	<div v-if="mode.loading" class="flex h-screen items-center justify-center text-neutral-400">
		Loading BioClean...
	</div>
	<div v-else-if="mode.error" class="flex h-screen flex-col items-center justify-center gap-3 text-neutral-500">
		<p>Couldn't reach BioClean.</p>
		<p v-if="mode.errorDetail" class="max-w-md text-center font-mono text-xs text-red-600">{{ mode.errorDetail }}</p>
		<div class="flex gap-2">
			<button class="touch-target rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-white" @click="loadMode">
				Try again
			</button>
			<a href="/login?redirect-to=/bioclean" class="touch-target rounded-[var(--radius-md)] border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">
				Log in again
			</a>
		</div>
	</div>
	<router-view v-else />
</template>

<script setup>
import { reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { createResource } from "frappe-ui";

const router = useRouter();
const mode = reactive({ loading: true, error: false, errorDetail: "", defaultMode: "pos", canSwitch: false });

const myMode = createResource({
	url: "bioclean.api.get_my_mode",
	auto: false,
});

async function loadMode() {
	mode.loading = true;
	mode.error = false;
	try {
		const result = await myMode.fetch();
		mode.defaultMode = result.default_mode;
		mode.canSwitch = result.can_switch;
		mode.loading = false;
		// Cashier-only users never see anything but /pos - not just hidden via
		// nav, the redirect itself is unconditional for them.
		router.replace(mode.defaultMode === "boss" ? "/boss" : "/pos");
	} catch (e) {
		// A session that expired mid-visit, a network blip, whatever - without
		// this the app just sat on "Loading BioClean..." forever with no way
		// out but a manual URL edit. Found from a real stuck screenshot.
		// Surfacing the raw error here too, since the backend has repeatedly
		// tested clean for this call - if it fails again, the actual
		// exception/status shown here is the fastest way to find out why,
		// rather than guessing blind from outside the browser.
		mode.loading = false;
		mode.error = true;
		mode.errorDetail = `${e.name || "Error"}: ${e.message || String(e)}${e.status ? ` (HTTP ${e.status})` : ""}`;
		console.error("BioClean get_my_mode failed:", e);
	}
}

onMounted(loadMode);
</script>
