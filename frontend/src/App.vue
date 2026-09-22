<template>
	<div v-if="mode.loading" class="flex h-screen items-center justify-center text-neutral-400">
		Loading BioClean...
	</div>
	<router-view v-else />
</template>

<script setup>
import { reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { createResource } from "frappe-ui";

const router = useRouter();
const mode = reactive({ loading: true, defaultMode: "pos", canSwitch: false });

const myMode = createResource({
	url: "bioclean.api.get_my_mode",
	auto: false,
});

onMounted(async () => {
	const result = await myMode.fetch();
	mode.defaultMode = result.default_mode;
	mode.canSwitch = result.can_switch;
	mode.loading = false;
	// Cashier-only users never see anything but /pos - not just hidden via
	// nav, the redirect itself is unconditional for them.
	router.replace(mode.defaultMode === "boss" ? "/boss" : "/pos");
});
</script>
