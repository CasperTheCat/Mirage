<script lang="ts">
	import { waitForDebugger } from 'inspector';

	import { onMount } from 'svelte';
	import { beforeUpdate, afterUpdate } from 'svelte';
	export let name: string;

	let countImages: number;
	countImages = 0;

	async function fetchStats()
	{
		let statistics: JSON = await fetch(`/stats`).then(r => r.json());

		if ("count" in statistics)
		{
			countImages = parseInt(statistics["count"], 10);
		}
	}

	async function GetUserInfo()
	{
		let userinfo: JSON = await fetch(`/api/user`).then(r => r.json());

		console.log(userinfo);

		name = userinfo['displayname'];
	}
	
	onMount(fetchStats);
	onMount(GetUserInfo);

	let photos = [];

	// Compute the width of the screen and adjust column count
	let columnarCount: number = 0;
	let columnImages = [];

	function argmin(a) {
		let lowest = 0;
		for (let i = 1; i < a.length; i++) {
			if (a[i] < a[lowest]) lowest = i;
		}
		return lowest;
	}

	async function updateColumns()
	{
		// We want to enforce a minimum of 250px and a max of 500 for this view.
		let proxy = Math.max(1, (innerWidth / 375));// + 1;
		//console.log(proxy)

		let newColumnCount = Math.floor(proxy);
		if (newColumnCount !== columnarCount)
		{
			// Update the lists
			columnImages = [];
			let heights = [];
			for (let i = 0; i < newColumnCount; ++i)
			{
				columnImages.push([]);
				heights.push(i * 0.001)
			}		

			for (let i = 0; i < photos.length; ++i)
			{
				//i % newColumnCount
				let operatingIndex = argmin(heights);
				//console.log("W", operatingIndex);
				//console.log(heights);
				columnImages[operatingIndex].push(photos[i]);
				heights[operatingIndex] += photos[i]["height"];
			}

			columnarCount = newColumnCount;
		}
	}

	// Also, fetch temporary images
	onMount(async () => {
		let blob: JSON = await fetch('/api/board/1/images').then(r => r.json());
		if ("images" in blob)
		{
			let fetchable = blob["images"];

			photos = blob["images"];
		}

		console.log(photos);

		



		photos.sort((a,b) => {
			let r1 = a["height"] / a["width"];
			let r2 = b["height"] / b["width"];
			return r2 - r1;
		});

		// if (photos.length > 20)
		// {
		// 	photos = photos.slice(0, 20);
		// }



		//console.log(photos);

		// Update
		await updateColumns();
	});

	//beforeUpdate(updateColumns);
	//onMount(updateColumns);

</script>

<svelte:window on:hashchange={GetUserInfo} on:resize={updateColumns}/>

<main>
	<h1>Hello {name}!</h1>
	<p>Visit the <a href="https://svelte.dev/tutorial">Svelte tutorial</a> to learn how to build Svelte apps.</p>
	<br/>
	<p>Welcome to the Mirage Moodboard</p>
	<p>Mirage contains {countImages} {countImages === 1 ? 'image' : 'images'}!</p>


	<div class="photos" style="grid-template-columns: repeat({columnarCount}, 1fr);">
		{#each columnImages as col}
			<div class="flexi">
				{#each col as photo}
					<img src={photo.url} alt="">
				{/each}
			</div>
		{:else}
			<!-- this block renders when photos.length === 0 -->
			<p>loading...</p>
		{/each}
	</div>

</main>

<style>
	.photos {
		width: 100%;
		display: grid;
		grid-gap: 0px;
		grid-row-gap: 0px;
	}

	.flexi {
		display: flex;
		flex-direction: column;
	}

	img {
		width: 100%;
		margin: 0;
		border: none;
	}

	@media (min-width: 640px) {
		main {
			max-width: none;
		}
	}
</style>