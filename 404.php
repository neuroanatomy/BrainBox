<?php
	include $_SERVER['DOCUMENT_ROOT']."/php/brainbox.php";
	
	$uri=$_SERVER['REQUEST_URI'];
	$args=array_filter(explode("/",$uri));
	brainbox(array_filter(explode("/",parse_url($uri,PHP_URL_PATH))));
?>