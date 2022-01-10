<script>
	import { createEventDispatcher } from 'svelte';

	export let hash = undefined;

	const dispatch = createEventDispatcher();

    async function HandleImageSummon(event)
    {
        console.log(event);

        dispatch('summon', {
            "hash": hash,
            "x": event.pageX,
            "y": event.pageY
        });
    }
</script>

<img src="/api/image/data/{hash}" alt="" on:click={HandleImageSummon}>

<style>
	img {
		width: 100%;
		margin: 0;
		border: none;
	}
</style>