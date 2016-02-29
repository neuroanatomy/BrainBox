<?php	

// http://files.figshare.com/1756790/002_t1_mpr_sag_standard.nii.gz

if(isset($_GET["action"]))
{
	switch($_GET["action"])
	{
		case "download":
			download($_GET);
			break;
		case "drawNiiSlice":
			drawNiiSlice($_GET);
			break;
	}
}

function download($params)
{
	$url=$params["url"];
	$hash=$params["hash"];
	
	$tokens = explode('/', $url);
	$filename=$tokens[sizeof($tokens)-1];
	$handle=@fopen($url,'r');
		
	if($handle)
	{
		$dir=$_SERVER['DOCUMENT_ROOT']."/brainbox/data/".$hash;
		
		if (!file_exists($dir)) {
			mkdir($dir,0777);
			chmod($dir,0777);
		}
		
		if (!file_exists($dir."/".$filename)) {
			$result=@file_put_contents($dir."/".$filename,$handle);
			chmod($dir."/".$filename, 0777);
			if($result)
			{
				$info=@exec("../bin/volume -i ".$dir."/".$filename." -info|".
				'awk \'/dim:/{printf"\"dim\":[%i,%i,%i],",$2,$3,$4}/voxelSize:/{printf"\"pixdim\":[%f,%f,%f]",$2,$3,$4}\''
				,$arr,$retval);
				echo '{"url":"'.$url.'", "localpath":"'.$dir.'/'.$filename.'", "filename":"'.$filename.'", "success":true, '.$info.'}';
			}
			else
				echo '{"success":false,"message":"CANNOT DOWNLOAD FILE FROM SOURCE","result":"'.$result.'"}';
		}
		else {
			$info=@exec("../bin/volume -i ".$dir."/".$filename." -info|".
			'awk \'/dim:/{printf"\"dim\":[%i,%i,%i],",$2,$3,$4}/voxelSize:/{printf"\"pixdim\":[%f,%f,%f]",$2,$3,$4}\''
			,$arr,$retval);
			echo '{"url":"'.$url.'", "localpath":"'.$dir.'/'.$filename.'", "filename":"'.$filename.'", "success":true, '.$info.'}';
		}
	}
	else
		echo '{"success":false,"message":"CANNOT OPEN FILE AT SOURCE","result":"'.$handle.'"}';
}
?>