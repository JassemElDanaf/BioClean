import { createRouter, createWebHistory } from "vue-router";

const routes = [
	{ path: "/", redirect: "/pos" },
	{
		path: "/pos",
		name: "CashierMode",
		component: () => import("./pages/CashierMode.vue"),
	},
	{
		path: "/boss",
		name: "BossMode",
		component: () => import("./pages/BossMode.vue"),
	},
];

const router = createRouter({
	history: createWebHistory("/bioclean"),
	routes,
});

export default router;
